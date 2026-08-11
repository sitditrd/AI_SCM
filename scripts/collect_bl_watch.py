# -*- coding: utf-8 -*-
"""
TWL Control Tower — 등록 BL 감시 수집기 (KLNET LogisView 대체)
==============================================================
등록된 BL(bl_watch)을 Edge Function `carrier-track` 으로 조회해 스냅샷을 남기고,
직전 스냅샷과 비교해 변경을 감지한다. ETD/ETA 변경만 메일로 알린다.

  python scripts/collect_bl_watch.py           # 수집 + 비교 + 알림 (기본)
  python scripts/collect_bl_watch.py --dry     # 조회·비교만 하고 DB 쓰기/메일 없음
  python scripts/collect_bl_watch.py --no-mail # 적재는 하되 메일은 보내지 않음
  python scripts/collect_bl_watch.py --sql     # SQL 파일만 생성(키 없이 MCP 적재용)

환경변수: SUPABASE_SERVICE_KEY (REST 적재용). 없으면 --sql 모드만 가능.

설계 근거: docs/03-architecture/화물추적_선사직접조회_설계.md
레거시 대응: 등록=TRK0002 / 주기수집=TRK0003·TRK0005 / 종료조건=공컨 반납
"""
import sys, os, json, time, datetime, urllib.request, urllib.error, urllib.parse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# 키 조회만 기존 수집기와 공유한다(환경변수 미상속 시 Windows 사용자 환경변수 레지스트리 직접 조회).
# sb() 는 반환값이 없어 GET 조회에 못 쓰므로 여기서 별도 헬퍼를 둔다.
from collect_upload_berth import env_key, SUPABASE_URL

SERVICE_KEY = env_key('SUPABASE_SERVICE_KEY')

CARRIER_API = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/carrier-track'
MAIL_API = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/notify-bl'

# 알림 대상 종류 — 2026-08-11 사용자 결정: ETD/ETA 만 발송.
# 나머지는 감지·기록만 하고 발송하지 않는다(추후 True 로 바꾸면 즉시 활성).
NOTIFY = {
    'etd': True,      # 출항 예정/실적 일시 변경
    'eta': True,      # 도착 예정/실적 일시 변경
    'vessel': False,  # 본선(모선)·항차 변경
    'stage': False,   # 단계 진입(출항·입항·양하 등)
    'gate': False,    # 적컨 반출 / 공컨 반납 완료
}

TIMEOUT = 60


def http_json(url, data=None, headers=None, timeout=TIMEOUT, method=None):
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Accept', 'application/json')
    if body is not None:
        req.add_header('Content-Type', 'application/json')
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode('utf-8')
        return json.loads(raw) if raw.strip() else None


def sb(method, path, body=None):
    """Supabase REST — GET 은 파싱된 결과를 돌려준다(기존 sb() 는 반환값이 없어 조회 불가)."""
    if not SERVICE_KEY:
        sys.exit('[FAIL] 환경변수 SUPABASE_SERVICE_KEY 미설정 — 등록 BL 조회/적재 불가')
    hdr = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY}
    if method in ('POST', 'PATCH'):
        hdr['Prefer'] = 'return=minimal'
    return http_json(SUPABASE_URL + path, data=body, headers=hdr, method=method)


def track(mbl):
    """carrier-track 조회 — 실패는 예외 대신 error 키로 돌려준다."""
    try:
        return http_json('%s?no=%s' % (CARRIER_API, urllib.parse.quote(mbl)))
    except urllib.error.HTTPError as e:
        return {'error': 'HTTP %s' % e.code}
    except Exception as e:
        return {'error': str(e)[:120]}


def summarize(res):
    """정규화 응답 → 비교용 평면 스냅샷.
    ETD = 첫 구간 출항, ETA = 마지막 구간 도착 (환적이 있으면 전 구간 기준 출발·도착)."""
    s = res.get('summary') or {}
    vs = res.get('voyages') or []
    first = vs[0] if vs else {}
    last = vs[-1] if vs else {}
    pol = (first.get('pol') or {}) if first else {}
    pod = (last.get('pod') or {}) if last else {}
    return {
        'carrier': res.get('carrier'),
        'status': status_label(res),
        'por': s.get('por'), 'pod': s.get('pod'),
        'vessel': s.get('vessel') or first.get('vessel'),
        'voyage': s.get('voyage') or first.get('voyage'),
        'etd': pol.get('date'), 'eta': pod.get('date'),
        'etd_actual': bool(pol.get('actual')), 'eta_actual': bool(pod.get('actual')),
    }


# 이벤트 문구 → 단계 (cargo.js 의 SLOTS 와 같은 캐논 순서; 종료 판정용)
STAGES = [
    ('eOut', r'empty\s*(container)?\s*(release|pick)'),
    ('fIn', r'gate\s*in to outbound|received \(fcl\)|outbound in cy'),
    ('load', r'loaded (on|onto|\(fcl\))'),
    ('atd', r'departure'),
    ('ts', r'transship|transshipment|feeder'),
    ('ata', r'arrival|berthing'),
    ('unld', r'unloaded|discharged \(fcl\)|inbound in cy'),
    ('fOut', r'gate\s*out from inbound|pick-up by merchant|transfer to designated'),
    ('eIn', r'empty (container )?return'),
]
STAGE_KO = {'eOut': '공컨 반출', 'fIn': '적컨 반입', 'load': '선적 완료', 'atd': '운송 중',
            'ts': '환적 중', 'ata': '입항', 'unld': '양하 완료', 'fOut': '반출 완료', 'eIn': '반납 완료'}


def last_stage(res):
    """가장 진행된 실적 단계 인덱스 (없으면 -1)"""
    import re
    best = -1
    for c in (res.get('containers') or []):
        for e in (c.get('events') or []):
            if not e.get('actual'):
                continue
            nm = str(e.get('name') or '')
            for i, (k, pat) in enumerate(STAGES):
                if re.search(pat, nm, re.I):
                    if i > best:
                        best = i
                    break
    return best


def status_label(res):
    i = last_stage(res)
    return STAGE_KO.get(STAGES[i][0], '조회됨') if i >= 0 else '조회됨'


def diff(prev, cur):
    """직전 스냅샷 대비 변경 목록. NOTIFY 로 발송 여부가 갈린다."""
    out = []
    if not prev:
        return out                      # 최초 수집은 변경이 아니다
    for f, kind, label in (('etd', 'etd', '출항 예정일시'), ('eta', 'eta', '도착 예정일시')):
        a, b = prev.get(f), cur.get(f)
        if a and b and str(a) != str(b):
            out.append({'kind': kind, 'field': label, 'old': str(a), 'new': str(b)})
    for f, label in (('vessel', '본선'), ('voyage', '항차')):
        a, b = prev.get(f), cur.get(f)
        if a and b and str(a) != str(b):
            out.append({'kind': 'vessel', 'field': label, 'old': str(a), 'new': str(b)})
    if prev.get('status') != cur.get('status') and cur.get('status'):
        kind = 'gate' if cur.get('status') in ('반출 완료', '반납 완료') else 'stage'
        out.append({'kind': kind, 'field': '진행 상태', 'old': prev.get('status') or '', 'new': cur.get('status')})
    return out


def mark_notified(mbl, kinds, err, since):
    """이번 실행에서 기록한 변경분만 발송 결과로 마감한다.
    since(=이 BL 처리 시작 시각) 로 범위를 좁혀야, 과거에 발송 실패로 남아 있던
    같은 종류의 건이 엉뚱하게 '발송됨'으로 덮이지 않는다."""
    body = {'notified': True} if err is None else {'notify_error': err}
    for k in kinds:
        try:
            sb('PATCH', '/rest/v1/bl_change_log?mbl_no=eq.%s&kind=eq.%s&notified=is.false&changed_at=gte.%s'
               % (urllib.parse.quote(mbl), urllib.parse.quote(k), urllib.parse.quote(since)), body)
        except Exception as e:
            print('     → 알림 상태 기록 실패(%s): %s' % (k, str(e)[:80]))


def main():
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    dry = '--dry' in flags
    no_mail = '--no-mail' in flags or dry

    rows = sb('GET', '/rest/v1/bl_watch?active=eq.true&select=*&order=id')
    if not rows:
        print('[INFO] 감시 대상 BL 이 없습니다 (bl_watch active=true 0건)')
        return 0
    print('[INFO] 감시 대상 %d건' % len(rows))

    changed_total = mailed = failed = 0
    for w in rows:
        mbl = w['mbl_no']
        t0 = datetime.datetime.now(datetime.timezone.utc).isoformat()   # 이번 건 처리 시작 — notified 마감 범위
        res = track(mbl)
        if res.get('error'):
            failed += 1
            print('[FAIL] %s — %s' % (mbl, res['error']))
            if not dry:
                sb('PATCH', '/rest/v1/bl_watch?id=eq.%s' % w['id'],
                   {'last_polled_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'poll_error': res['error'][:200]})
            time.sleep(2)
            continue

        cur = summarize(res)
        prev_rows = sb('GET', '/rest/v1/bl_snapshot?mbl_no=eq.%s&select=*&order=polled_at.desc&limit=1'
                       % urllib.parse.quote(mbl))
        prev = prev_rows[0] if prev_rows else None

        changes = diff(prev, cur)
        stage_i = last_stage(res)
        done = stage_i >= 0 and STAGES[stage_i][0] == 'eIn'   # 공컨 반납 = 추적 종료(레거시 조건)

        print('[OK] %s %s | ETD %s / ETA %s%s%s' % (
            mbl, cur['status'], cur['etd'] or '-', cur['eta'] or '-',
            ' | 변경 %d건' % len(changes) if changes else '',
            ' | 추적종료' if done else ''))
        for c in changes:
            print('     · %s: %s → %s%s' % (c['field'], c['old'], c['new'],
                                            '' if NOTIFY.get(c['kind']) else ' (알림 off)'))

        if dry:
            time.sleep(1)
            continue

        snap = dict(cur); snap['mbl_no'] = mbl; snap['payload'] = res
        sb('POST', '/rest/v1/bl_snapshot', snap)
        sb('PATCH', '/rest/v1/bl_watch?id=eq.%s' % w['id'], {
            'last_polled_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'last_status': cur['status'], 'poll_error': None,
            'carrier': cur['carrier'] or w.get('carrier'),
            'active': (not done),
        })

        notify_list = []
        for c in changes:
            rec = {'mbl_no': mbl, 'kind': c['kind'], 'field': c['field'],
                   'old_value': c['old'], 'new_value': c['new'], 'notified': False}
            if NOTIFY.get(c['kind']) and w.get('notify_email') and not no_mail:
                notify_list.append(c)
            sb('POST', '/rest/v1/bl_change_log', rec)
        changed_total += len(changes)

        if notify_list:
            kinds = sorted(set(c['kind'] for c in notify_list))
            try:
                http_json(MAIL_API, {
                    'email': w['notify_email'], 'mbl_no': mbl,
                    'carrier': cur['carrier'], 'vessel': cur['vessel'], 'voyage': cur['voyage'],
                    'por': cur['por'], 'pod': cur['pod'], 'status': cur['status'],
                    'changes': notify_list,
                })
                mailed += 1
                print('     → 알림 발송 %s (%d건)' % (w['notify_email'], len(notify_list)))
                # 발송 성공한 종류만 notified 로 마감 — 재실행 시 중복 발송 방지·미발송 추적용
                mark_notified(mbl, kinds, None, t0)
            except Exception as e:
                msg = str(e)[:200]
                print('     → 알림 실패: %s' % msg[:100])
                mark_notified(mbl, kinds, msg, t0)

        time.sleep(2)   # 선사 서버 부하·레이트리밋(SITC) 보호

    print('[DONE] 대상 %d · 변경 %d · 메일 %d · 실패 %d' % (len(rows), changed_total, mailed, failed))
    return 0


if __name__ == '__main__':
    sys.exit(main())
