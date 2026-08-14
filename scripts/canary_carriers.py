# -*- coding: utf-8 -*-
"""주간 카나리아 — 선사 어댑터·수집 파이프라인 건전성 점검 (매주 일요일 08:00)

왜 필요한가:
  선사가 응답 구조를 바꾸면 조회는 HTTP 200 인데 내용만 비어서 돌아온다. 수집기는
  정상 종료(exit=0)하고 스케줄러에도 빨간불이 안 뜬다 — COSCO 에서 실제로 겪었다
  (bill 응답의 컨테이너 이벤트가 전건 null 로 바뀐 건). 즉 **조용한 고장**이 이 시스템의
  주된 실패 양식이고, 그걸 잡는 게 이 스크립트의 목적이다.

무엇을 하는가:
  ① 가동 중인 선사마다 실제 B/L 로 조회해 결과 형태를 검증한다
     (컨테이너 ≥1 · 이벤트 ≥1 · 9개 게이트 슬롯에 최소 1개 매핑)
  ② 지난주 기준선과 비교해 이벤트 수 급감·슬롯 매핑 실패를 잡는다
  ③ 수집 스케줄러 건전성을 본다(최근 7일 스냅샷 증가량, bl_watch.log 의 [FAIL])
  ④ 이상이 있을 때만 메일을 보낸다. 정상이면 로그만 남기고 조용히 끝낸다

무엇을 하지 않는가:
  **코드를 자동으로 고치지 않는다.** 잘못된 자동 수정은 멀쩡히 돌던 선사를 통째로
  죽이고, 주말 새벽이라 월요일까지 아무도 모른다. 감지는 자동, 수정은 사람 확인 후다.

프로브 B/L 선정:
  고정 B/L 은 선사가 오래된 건을 정리하면서 언젠가 빈 응답이 되고, 그때부터 매주
  거짓 경보를 낸다. 그래서 bl_watch 에 등록된 **살아있는 B/L 을 우선** 쓰고,
  해당 선사 등록분이 없을 때만 PINNED 를 쓴다.

실행: python scripts/canary_carriers.py [--dry-run] [--force-mail]
로그: logs/canary.log · 기준선: logs/canary_baseline.json (git 제외)
"""

import argparse
import datetime
import io
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collect_bl_watch import (          # noqa: E402  수집기와 같은 판정 로직을 쓴다
    CARRIER_API, STAGES, STAGE_KO, http_json, sb, track, summarize, last_stage,
)

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGDIR = os.path.join(ROOT, 'logs')
BASELINE = os.path.join(LOGDIR, 'canary_baseline.json')
NOTIFY_API = CARRIER_API.rsplit('/', 1)[0] + '/notify-bl'
MAIL_TO = os.environ.get('CANARY_EMAIL', 'itt@twsc.co.kr')

# 등록분이 없을 때만 쓰는 예비 B/L (2026-08 기준 조회되던 실 건)
PINNED = {
    'ONEY': 'ONEYSELG91573700',
    'COSU': 'COSU6505174350',
    'EGLV': None,      # 예비 없음 — 등록분이 없으면 '점검 불가'로 보고한다
    'SMLM': None,
    'SITC': None,
}
# 이벤트 수가 이 비율 밑으로 떨어지면 경고(선사가 이력을 줄이는 정상 변동과 구분)
DROP_WARN = 0.5
# 최근 7일 건별 조회 실패가 이 수를 넘으면 보고(선사 일시 장애와 구분)
BL_FAIL_WARN = 10
# 선사 조회 실패 시 재시도 대기(초) — SITC 429 는 45초쯤 뒤 풀린다
RETRY_WAIT = 50
# 선사 간 간격(초) — 연속 호출로 레이트리밋을 자극하지 않게 띄운다
SPACING = 3


def log(msg):
    line = '%s %s' % (datetime.datetime.now().strftime('%H:%M:%S'), msg)
    print(line)
    try:
        with io.open(os.path.join(LOGDIR, 'canary.log'), 'a', encoding='utf-8') as f:
            f.write(line + '\n')
    except OSError:
        pass


def load_baseline():
    try:
        return json.load(io.open(BASELINE, encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def save_baseline(d):
    if not os.path.isdir(LOGDIR):
        os.makedirs(LOGDIR)
    json.dump(d, io.open(BASELINE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def slot_hits(res):
    """정규화 결과의 이벤트 명칭이 9개 게이트 슬롯 중 몇 개에 매핑되는가.
    0 이면 선사가 이벤트 어휘를 바꾼 것 — 화면 표가 통째로 비게 된다."""
    names = []
    for c in (res.get('containers') or []):
        for e in (c.get('events') or []):
            names.append(str(e.get('name') or ''))
    hit = set()
    for nm in names:
        for key, pat in STAGES:
            if re.search(pat, nm, re.I):
                hit.add(key)
                break
    return len(hit), len(names)


def stage_label(res):
    """last_stage() 는 인덱스를 준다 — 로그에 숫자가 찍히지 않게 라벨로 바꾼다."""
    i = last_stage(res)
    return STAGE_KO.get(STAGES[i][0], '') if i >= 0 else '조회됨'


def live_carriers():
    d = http_json(CARRIER_API + '?api=list') or {}
    return [c['scac'] for c in (d.get('live') or [])]


def probe_bl(scac):
    """프로브 B/L 선정 — 활성 등록분 > 종료 등록분 > 예비.

    종료(active=false) 건도 프로브로는 쓸 만하다. 반납 완료된 화물이라도 선사가
    이력을 유지하는 동안은 조회되고, 어댑터가 깨졌는지 보는 데는 충분하다.
    이 폴백이 없으면 활성 건이 없는 선사(SM상선 등)가 매주 SKIP 되어 점검 사각이 된다."""
    for cond, src in (('&active=eq.true', 'registered'), ('', 'terminated')):
        rows = sb('GET', '/rest/v1/bl_watch?select=mbl_no&carrier=eq.%s%s'
                         '&order=created_at.desc&limit=1' % (scac, cond)) or []
        if rows:
            return rows[0]['mbl_no'], src
    return PINNED.get(scac), 'pinned'


def check_carrier(scac, base):
    bl, src = probe_bl(scac)
    if not bl:
        return {'scac': scac, 'state': 'skip', 'note': 'no probe B/L (등록분·예비 모두 없음)'}
    # 1회 실패로 단정하지 않는다 — SITC 는 연속 호출 시 429 로 지연되고 45초쯤 뒤 복구된다.
    # 주간 점검에서 일시 장애를 어댑터 고장으로 보고하면 매번 거짓 경보가 된다(실측).
    res = track(bl)
    if not res or res.get('error'):
        log('       · %s 1차 실패, %d초 후 재시도' % (scac, RETRY_WAIT))
        time.sleep(RETRY_WAIT)
        res = track(bl)
    if not res or res.get('error'):
        return {'scac': scac, 'bl': bl, 'src': src, 'state': 'error',
                'note': (res or {}).get('error', 'no response')}
    cn = len(res.get('containers') or [])
    slots, evs = slot_hits(res)
    cur = {'scac': scac, 'bl': bl, 'src': src, 'state': 'ok',
           'containers': cn, 'events': evs, 'slots': slots,
           'status': stage_label(res), 'summary': summarize(res)}
    prev = base.get(scac) or {}
    issues = []
    if cn == 0:
        issues.append(('containers', prev.get('containers', '?'), 0))
    if evs == 0:
        issues.append(('events', prev.get('events', '?'), 0))
    elif slots == 0:
        # 이벤트는 오는데 9슬롯에 하나도 안 걸린다 = 어휘 변경. 화면이 빈 표가 된다.
        issues.append(('slot mapping', '%s slots' % prev.get('slots', '?'), '0 slots'))
    else:
        pe = prev.get('events')
        if isinstance(pe, int) and pe >= 4 and evs < pe * DROP_WARN:
            issues.append(('events dropped', pe, evs))
    cur['issues'] = issues
    if issues:
        cur['state'] = 'degraded'
    return cur


def scan_fail_markers(days):
    """bl_watch.log 에서 최근 N일치 [FAIL] 을 성격별로 센다.

    로그 전체를 세면 몇 달 전 일시 장애까지 잡혀 매주 같은 거짓 경보가 난다(실측:
    SITC 429 두 건이 계속 카운트됐다). 실행 블록(`===== 날짜 시각 =====`) 단위로
    끊어 최근 N일만 보고, 성격을 나눈다:
      · infra     — bat 이 찍는 것(파이썬 없음·수집기 비정상 종료). 1건도 이상이다.
      · transient — 건별 조회 실패(선사 레이트리밋 등). 잦을 때만 이상이다.
    """
    path = os.path.join(LOGDIR, 'bl_watch.log')
    try:
        with io.open(path, encoding='utf-8', errors='replace') as f:
            text = f.read()[-500000:]
    except OSError:
        return 0, 0
    cutoff = datetime.date.today() - datetime.timedelta(days=days)
    infra = transient = 0
    recent = False
    for line in text.splitlines():
        m = re.match(r'=====\s+(\d{4})-(\d{2})-(\d{2})', line)
        if m:
            d = datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            recent = d >= cutoff
            continue
        if not recent or '[FAIL]' not in line:
            continue
        if 'python not found' in line or 'collector returned' in line:
            infra += 1
        else:
            transient += 1
    return infra, transient


def pipeline_health():
    """수집 파이프라인이 실제로 돌고 있는지 — 스냅샷 증가와 로그의 [FAIL]."""
    out = {}
    since = (datetime.datetime.now(datetime.timezone.utc)
             - datetime.timedelta(days=7)).strftime('%Y-%m-%dT%H:%M:%SZ')
    snaps = sb('GET', '/rest/v1/bl_snapshot?select=mbl_no&polled_at=gte.%s' % since) or []
    out['snapshots_7d'] = len(snaps)
    watch = sb('GET', '/rest/v1/bl_watch?select=mbl_no&active=eq.true') or []
    out['active'] = len(watch)
    infra, transient = scan_fail_markers(7)
    out['infra_fails'], out['bl_fails'] = infra, transient
    issues = []
    if out['active'] and out['snapshots_7d'] == 0:
        issues.append(('collector', 'running', 'no snapshot in 7 days'))
    # 인프라 실패(파이썬 없음·수집기 비정상 종료)는 1건이라도 즉시 보고한다.
    if infra > 0:
        issues.append(('collector startup', 'clean', '%d failure(s) in 7d' % infra))
    # 건별 실패는 SITC 429 처럼 일시적인 게 섞인다 — 임계치를 넘을 때만 보고한다.
    if transient >= BL_FAIL_WARN:
        issues.append(('per-B/L query failures', '< %d' % BL_FAIL_WARN, '%d in 7d' % transient))
    out['issues'] = issues
    return out


def send_mail(issues, dry):
    changes = [{'kind': 'canary', 'field': f, 'old': str(o), 'new': str(n)} for f, o, n in issues]
    body = {
        'email': MAIL_TO,
        'mbl_no': 'WEEKLY-CANARY',
        'label': 'Check',
        'subject': 'Carrier Adapter Health - %d issue(s)' % len(issues),
        'intro': 'Weekly canary detected anomalies in carrier adapters or the collection pipeline. '
                 'No code was changed automatically - please review.',
        'changes': changes,
    }
    if dry:
        log('[DRY] 메일 미발송 — payload: %s' % json.dumps(body, ensure_ascii=False)[:400])
        return
    r = http_json(NOTIFY_API, data=body)
    log('[MAIL] %s → %s' % (MAIL_TO, json.dumps(r, ensure_ascii=False)[:160]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true', help='메일 미발송, 기준선 미갱신')
    ap.add_argument('--force-mail', action='store_true', help='이상 없어도 메일 발송(발송 경로 점검용)')
    a = ap.parse_args()

    log('===== 카나리아 점검 시작 =====')
    base = load_baseline()
    scacs = live_carriers()
    log('[INFO] 가동 선사 %d사: %s' % (len(scacs), ', '.join(scacs)))

    results, issues = [], []
    for i, scac in enumerate(scacs):
        if i:
            time.sleep(SPACING)
        r = check_carrier(scac, base)
        results.append(r)
        if r['state'] == 'ok':
            log('[OK]   %-5s %s (%s) cntr=%d ev=%d slots=%d/9 %s'
                % (scac, r['bl'], r['src'], r['containers'], r['events'], r['slots'], r['status']))
        elif r['state'] == 'skip':
            log('[SKIP] %-5s %s' % (scac, r['note']))
        elif r['state'] == 'error':
            log('[ERR]  %-5s %s — %s' % (scac, r.get('bl', ''), r['note']))
            issues.append((scac, 'ok', 'query failed: %s' % r['note'][:60]))
        else:
            log('[WARN] %-5s %s cntr=%d ev=%d slots=%d/9'
                % (scac, r['bl'], r['containers'], r['events'], r['slots']))
            for f, o, n in r['issues']:
                log('       · %s: %s → %s' % (f, o, n))
                issues.append(('%s %s' % (scac, f), o, n))

    ph = pipeline_health()
    log('[PIPE] 감시중 %d건 · 최근7일 스냅샷 %d건 · 기동실패 %d · 건별실패 %d'
        % (ph['active'], ph['snapshots_7d'], ph['infra_fails'], ph['bl_fails']))
    issues.extend(ph['issues'])

    if issues:
        log('[RESULT] 이상 %d건 — 메일 발송' % len(issues))
        send_mail(issues, a.dry_run)
    elif a.force_mail:
        log('[RESULT] 이상 없음 — --force-mail 로 테스트 발송')
        send_mail([('canary', 'n/a', 'test mail - all carriers healthy')], a.dry_run)
    else:
        log('[RESULT] 이상 없음 — 메일 없음')

    if not a.dry_run:
        nb = {r['scac']: {k: r[k] for k in ('containers', 'events', 'slots') if k in r}
              for r in results if r['state'] in ('ok', 'degraded')}
        nb['_checked_at'] = datetime.datetime.now().isoformat(timespec='seconds')
        save_baseline(nb)
        log('[BASE] 기준선 갱신 %d사' % (len(nb) - 1))
    log('===== 종료 =====')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as e:                      # noqa: BLE001 — 어떤 실패든 로그에 남기고 0 종료
        log('[FATAL] %s' % e)
        sys.exit(0)
