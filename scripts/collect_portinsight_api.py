# -*- coding: utf-8 -*-
"""
TWL Port Insight — IMF PortWatch 오픈 API 수집기
=====================================================
IMF PortWatch(portwatch.imf.org, ArcGIS 오픈데이터)에서 Focus Port 93개의
일별 항만 활동(port calls·물동량)을 수집해 항만 혼잡도 지수 PCI(Port Congestion Index)를 산출하고
Supabase pi_ports / pi_snapshot 을 갱신한다.

  데이터 소스 : Daily_Ports_Data FeatureServer (무료·인증 불필요, 주간 배치 갱신, lag 약 7~10일)
  항만 매핑   : portwatch_mapping.json (Focus 93 ↔ PortWatch portid, 93/93 매칭)

PCI 산출 (프록시 모델 v2):
  - 활동량 백분위 60% : 최근 7일 평균 portcalls가 지난 120일 7일-이동평균 분포에서 차지하는 백분위
  - 물동량 백분위 25% : 최근 7일 평균 (import+export)의 동일 방식 백분위
  - 모멘텀      15% : (최근 7일 - 직전 7일)/직전 7일 변화율을 시그모이드로 0~100 매핑
  - delay_h  = (PCI/100)^1.5 * 48        (접안 지연 추정치, 시간)
  - berthed  = 최신 7일 평균 portcalls     (일평균 기항 척수)
  - waiting  = berthed * max(0, PCI-50)/100 * 0.8 (대기 척수 추정치)
  ※ PortWatch에는 대기시간 필드가 없어 위 값들은 활동량 기반 추정치다.
  ※ v2: 부산·광양·인천은 선석배정 실측(bs_vessel_calls)으로 접안/대기 척수를 덮어쓴다.

실행:
  python collect_portinsight_api.py            ← Supabase REST 직접 갱신 (SUPABASE_SERVICE_KEY 필요)
  python collect_portinsight_api.py --sql      ← update_portinsight.sql 생성 (키 불필요, Claude 스케쥴러 경로)

필요 패키지: pip install requests
"""
import sys, os, json, math, datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import requests

PW_DAILY = 'https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query'
MAPPING = r'C:\Temp\AI_SCM\scripts\portwatch_mapping.json'
SQL_OUT = r'C:\Temp\AI_SCM\sql\update_portinsight.sql'
SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
PUBLISHABLE_KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv'  # 읽기 전용(전주 대비 delta 계산용)

WINDOW_DAYS = 120      # 백분위 산출 기간
CHUNK = 8              # 쿼리당 portid 수 (8개 x 120일 ≈ 960행 < maxRecordCount 1000)
FOCUS_TOTAL = 93


def levelOf(t):
    if t >= 75: return 'CONGESTED'
    if t >= 50: return 'BUSY'
    if t >= 25: return 'STABLE'
    return 'LOW'


def fetch_daily(portids, since):
    """portid 묶음의 since 이후 일별 portcalls 조회 (페이징 포함)"""
    rows, offset = [], 0
    ids = ','.join("'%s'" % p for p in portids)
    where = "portid IN (%s) AND date >= DATE '%s'" % (ids, since)
    while True:
        r = requests.get(PW_DAILY, params={
            'where': where, 'outFields': 'portid,date,portcalls,portcalls_container,import,export',
            'orderByFields': 'portid,date', 'resultOffset': offset, 'f': 'json',
        }, timeout=60)
        r.raise_for_status()
        js = r.json()
        if 'error' in js:
            raise RuntimeError('PortWatch API error: %s' % js['error'])
        feats = js.get('features', [])
        rows += [f['attributes'] for f in feats]
        if not js.get('exceededTransferLimit'):
            break
        offset += len(feats)
    return rows


def rolling7(series):
    """일별 값 리스트 → 7일 이동평균 리스트"""
    out = []
    for i in range(6, len(series)):
        out.append(sum(series[i - 6:i + 1]) / 7.0)
    return out


def percentile_rank(values, x):
    """x가 values 분포에서 차지하는 백분위 (0~100)"""
    if not values:
        return 50.0
    below = sum(1 for v in values if v < x)
    equal = sum(1 for v in values if v == x)
    return 100.0 * (below + 0.5 * equal) / len(values)


def sigmoid100(m, k=6.0):
    """변화율 m(-1~+∞) → 0~100 (m=0이면 50)"""
    return 100.0 / (1.0 + math.exp(-k * m))


def compute_metrics(daily_rows, mapping):
    """portid별 시계열 → 항만별 PCI v2/지연/대기/접안 산출"""
    by_pid = {}
    for r in daily_rows:
        by_pid.setdefault(r['portid'], []).append(r)
    results, latest_date = {}, None
    for pid, rows in by_pid.items():
        rows.sort(key=lambda r: r['date'])
        series = [r.get('portcalls') or 0 for r in rows]
        trade = [(r.get('import') or 0) + (r.get('export') or 0) for r in rows]
        if len(series) < 21:      # 데이터 3주 미만이면 산출 보류
            continue
        r7 = rolling7(series)
        t7 = rolling7(trade)
        cur, cur_t = r7[-1], t7[-1]
        act_pct = percentile_rank(r7[:-1], cur)
        trade_pct = percentile_rank(t7[:-1], cur_t)
        prev7 = r7[-8] if len(r7) >= 8 else (sum(r7[:-1]) / max(1, len(r7) - 1))
        momentum = sigmoid100((cur - prev7) / prev7 if prev7 > 0 else 0.0)
        tpfs = round(0.60 * act_pct + 0.25 * trade_pct + 0.15 * momentum, 1)
        delay = round((tpfs / 100.0) ** 1.5 * 48, 1)
        berthed = max(1, int(round(cur)))
        waiting = int(round(berthed * max(0.0, tpfs - 50) / 100.0 * 0.8))
        d = rows[-1]['date']
        if latest_date is None or d > latest_date:
            latest_date = d
        results[pid] = {'tpfs': tpfs, 'delay_h': delay, 'waiting': waiting, 'berthed': berthed, 'asof': d}
    return results, latest_date


# 국내 항만 실측 연계: 선석배정(bs_vessel_calls) → 접안/대기 척수 덮어쓰기
KOREA_TERMINALS = {
    'Busan':     ['PNIT', 'PNC', 'HJNC', 'HPNT', 'BNCT', 'DGT'],
    'Gwangyang': ['GWCT'],
    'Incheon':   ['E1CT', 'ICON'],
}


def korea_enrich(port_rows):
    """부산·광양·인천의 waiting/berthed를 선석배정 실측으로 교체. 실패 시 조용히 건너뜀."""
    try:
        H = {'apikey': PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + PUBLISHABLE_KEY}
        r = requests.get(SUPABASE_URL + '/rest/v1/bs_vessel_calls'
                         '?select=collected_date,terminal_cd,status,eta'
                         '&order=collected_date.desc&limit=1000', headers=H, timeout=20)
        r.raise_for_status()
        rows = r.json()
        if not rows:
            return []
        latest = rows[0]['collected_date']
        rows = [x for x in rows if x['collected_date'] == latest]
        ref = datetime.datetime.fromisoformat(latest + 'T06:00:00+09:00')
        applied = []
        for en, terms in KOREA_TERMINALS.items():
            sub = [x for x in rows if x['terminal_cd'] in terms]
            if not sub:
                continue
            berthed = sum(1 for x in sub if x['status'] in ('ARRIVED', 'WORKING'))
            waiting = 0
            for x in sub:
                if x['status'] != 'PLANNED' or not x.get('eta'):
                    continue
                try:
                    eta = datetime.datetime.fromisoformat(x['eta'].replace('Z', '+00:00'))
                    if eta <= ref + datetime.timedelta(hours=24):
                        waiting += 1
                except ValueError:
                    pass
            for pr in port_rows:
                if pr['en'] == en:
                    pr['berthed'], pr['waiting'] = berthed, waiting
                    applied.append('%s(접안 %d/대기 %d)' % (en, berthed, waiting))
        return applied
    except Exception as e:
        print('[WARN] 국내 항만 실측 연계 건너뜀:', e)
        return []


def read_previous_levels():
    """전주 대비 delta 계산용 — 현재 pi_ports 레벨 분포 조회 (publishable key, 실패해도 무방)"""
    try:
        r = requests.get(SUPABASE_URL + '/rest/v1/pi_ports?select=name_en,tpfs',
                         headers={'apikey': PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + PUBLISHABLE_KEY}, timeout=15)
        r.raise_for_status()
        dist = {'LOW': 0, 'STABLE': 0, 'BUSY': 0, 'CONGESTED': 0}
        for row in r.json():
            dist[levelOf(float(row['tpfs']))] += 1
        return dist
    except Exception:
        return None


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def main():
    sql_mode = '--sql' in sys.argv[1:]
    if not sql_mode and not SERVICE_KEY:
        sys.exit('환경변수 SUPABASE_SERVICE_KEY 가 없습니다. (키 없이 쓰려면 --sql 모드 사용)')
    if not sql_mode and SERVICE_KEY.startswith('sb_publishable'):
        sys.exit('SUPABASE_SERVICE_KEY 에 공개키(sb_publishable_...)가 들어 있습니다. Secret 키(sb_secret_...)로 교체하세요.')

    mp = json.load(open(MAPPING, encoding='utf-8'))
    ports = mp['ports']
    pids = sorted(set(p['portid'] for p in ports))
    since = (datetime.date.today() - datetime.timedelta(days=WINDOW_DAYS)).isoformat()

    print('PortWatch 조회: %d개 portid, %s 이후' % (len(pids), since))
    daily = []
    for i in range(0, len(pids), CHUNK):
        daily += fetch_daily(pids[i:i + CHUNK], since)
    print('일별 행 수신: %d' % len(daily))

    metrics, latest = compute_metrics(daily, mp)
    if not metrics or latest is None:
        sys.exit('산출 실패: PortWatch 데이터 부족')

    # 항만별 결과 (매핑 순서 = data.js 순서, LA/롱비치는 portid 공유)
    port_rows, missing = [], []
    for p in ports:
        m = metrics.get(p['portid'])
        if not m:
            missing.append(p['en'])
            continue
        port_rows.append({'en': p['en'], **m})

    # v2: 부산·광양·인천 접안/대기 척수를 선석배정 실측으로 교체
    enriched = korea_enrich(port_rows)
    if enriched:
        print('국내 실측 연계:', ', '.join(enriched))

    # 스냅샷 집계
    dist_now = {'LOW': 0, 'STABLE': 0, 'BUSY': 0, 'CONGESTED': 0}
    for r in port_rows:
        dist_now[levelOf(r['tpfs'])] += 1
    n = len(port_rows)
    avg_tpfs = round(sum(r['tpfs'] for r in port_rows) / n, 1)
    avg_delay = round(sum(r['delay_h'] for r in port_rows) / n, 1)
    critical = dist_now['CONGESTED']
    risk = 'HIGH' if (critical >= 15 or avg_tpfs >= 60) else ('MEDIUM' if (critical >= 8 or avg_tpfs >= 50) else 'LOW')
    prev = read_previous_levels()
    latest_d = datetime.date.fromisoformat(latest)
    p_start, p_end = (latest_d - datetime.timedelta(days=6)).isoformat(), latest

    dist_json = json.dumps([
        {'level': lv, 'ratio': round(100.0 * dist_now[lv] / n, 1), 'count': dist_now[lv],
         'delta': (dist_now[lv] - prev[lv]) if prev else 0}
        for lv in ('LOW', 'STABLE', 'BUSY', 'CONGESTED')
    ])

    if sql_mode:
        lines = ['-- 자동 생성: collect_portinsight_api.py --sql (IMF PortWatch, 기준일 %s, %d개 항만)' % (latest, n)]
        for r in port_rows:
            lines.append(
                'update public.pi_ports set tpfs=%s, delay_h=%s, waiting_cnt=%d, berthed_cnt=%d, updated_at=now() '
                'where name_en=%s;' % (r['tpfs'], r['delay_h'], r['waiting'], r['berthed'], q(r['en'])))
        lines.append(
            "update public.pi_snapshot set total_ports=%d, tpfs=%s, critical_ports=%d, global_risk='%s', "
            "avg_delay_h=%s, distribution=%s::jsonb, period_start='%s', period_end='%s', updated_at=now() where id=1;"
            % (FOCUS_TOTAL, avg_tpfs, critical, risk, avg_delay, q(dist_json)[0:], p_start, p_end))
        open(SQL_OUT, 'w', encoding='utf-8').write('\n'.join(lines))
        print('[OK] %s 생성 — 항만 %d건, 종합 PCI %s, CONGESTED %d, 리스크 %s, 기준 %s~%s%s'
              % (SQL_OUT, n, avg_tpfs, critical, risk, p_start, p_end,
                 (' | 데이터 부족 제외: ' + ','.join(missing)) if missing else ''))
        return

    # REST 모드
    H = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
         'Content-Type': 'application/json', 'Prefer': 'return=minimal'}
    for r in port_rows:
        resp = requests.patch(SUPABASE_URL + '/rest/v1/pi_ports?name_en=eq.' + requests.utils.quote(r['en']),
                              headers=H, json={'tpfs': r['tpfs'], 'delay_h': r['delay_h'],
                                               'waiting_cnt': r['waiting'], 'berthed_cnt': r['berthed']}, timeout=30)
        if resp.status_code >= 300:
            sys.exit('[FAIL] pi_ports %s → HTTP %d: %s' % (r['en'], resp.status_code, resp.text[:200]))
    resp = requests.patch(SUPABASE_URL + '/rest/v1/pi_snapshot?id=eq.1', headers=H, json={
        'total_ports': FOCUS_TOTAL, 'tpfs': avg_tpfs, 'critical_ports': critical, 'global_risk': risk,
        'avg_delay_h': avg_delay, 'distribution': json.loads(dist_json),
        'period_start': p_start, 'period_end': p_end}, timeout=30)
    if resp.status_code >= 300:
        sys.exit('[FAIL] pi_snapshot → HTTP %d: %s' % (resp.status_code, resp.text[:200]))
    print('[OK] Supabase 갱신 — 항만 %d건, 종합 PCI %s, CONGESTED %d, 리스크 %s, 기준 %s~%s'
          % (n, avg_tpfs, critical, risk, p_start, p_end))


if __name__ == '__main__':
    main()
