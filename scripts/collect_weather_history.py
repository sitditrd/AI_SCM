# -*- coding: utf-8 -*-
"""
TWL 항만 기상 이력 수집기 — Open-Meteo (무료·무인증)
=====================================================
weather.js가 화면에 실시간 표시하는 것과 동일한 지점(부산신항·광양항·인천항)의
현재 기상(파고·파주기·풍속·돌풍)을 weather_history 테이블에 축적한다.
예측 분석용(파고×접안 지연 상관 등) — 6시간 주기 스케줄 실행 권장.

  python collect_weather_history.py          ← Supabase REST 적재 (SUPABASE_SERVICE_KEY 필요)
  python collect_weather_history.py --sql    ← sql/upload_weather.sql 생성 (키 불필요, 스케줄러 경로)
"""
import sys, os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import requests

SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
SQL_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'sql', 'upload_weather.sql')
PORTS = [                       # weather.js PORTS 와 동일 좌표 유지
    ('부산신항', 35.05, 128.79),
    ('광양항', 34.88, 127.72),
    ('인천항', 37.42, 126.60),
]


def cur(url):
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return (r.json() or {}).get('current') or {}


def collect():
    rows = []
    for name, lat, lng in PORTS:
        try:
            m = cur('https://marine-api.open-meteo.com/v1/marine?latitude=%s&longitude=%s'
                    '&current=wave_height,wave_period&timezone=Asia%%2FSeoul' % (lat, lng))
        except Exception:
            m = {}
        try:
            w = cur('https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s'
                    '&current=wind_speed_10m,wind_gusts_10m&wind_speed_unit=ms&timezone=Asia%%2FSeoul' % (lat, lng))
        except Exception:
            w = {}
        rows.append({'port': name,
                     'wave_height_m': m.get('wave_height'), 'wave_period_s': m.get('wave_period'),
                     'wind_speed_ms': w.get('wind_speed_10m'), 'wind_gust_ms': w.get('wind_gusts_10m')})
    return rows


def q(v):
    return 'null' if v is None else str(v)


def main():
    sql_mode = '--sql' in sys.argv[1:]
    if not sql_mode and not SERVICE_KEY:
        sys.exit('환경변수 SUPABASE_SERVICE_KEY 미설정 — --sql 모드를 사용하십시오.')
    rows = collect()
    ok = [r for r in rows if any(v is not None for k, v in r.items() if k != 'port')]
    if not ok:
        sys.exit('[FAIL] 3개 항만 모두 조회 실패 — 네트워크/Open-Meteo 상태 확인')

    if sql_mode:
        vals = ',\n'.join("  ('%s', %s, %s, %s, %s)"
                          % (r['port'], q(r['wave_height_m']), q(r['wave_period_s']),
                             q(r['wind_speed_ms']), q(r['wind_gust_ms'])) for r in ok)
        with open(SQL_OUT, 'w', encoding='utf-8') as fp:
            fp.write('-- 자동 생성: collect_weather_history.py --sql (obs_ts는 DB now() 기본값)\n'
                     'insert into public.weather_history '
                     '(port, wave_height_m, wave_period_s, wind_speed_ms, wind_gust_ms) values\n'
                     + vals + ';')
        print('[OK] %d개 항만 → %s 생성 완료' % (len(ok), SQL_OUT))
        return

    r = requests.post(SUPABASE_URL + '/rest/v1/weather_history',
                      headers={'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY,
                               'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                      json=ok, timeout=30)
    if r.status_code >= 300:
        sys.exit('[FAIL] HTTP %d: %s' % (r.status_code, r.text[:200]))
    print('[OK] %d개 항만 적재 완료' % len(ok))


if __name__ == '__main__':
    main()
