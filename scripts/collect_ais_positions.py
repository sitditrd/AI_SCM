# -*- coding: utf-8 -*-
"""
TWL 자체 AIS 수신 PoC — AISStream.io 웹소켓 (무료)
=====================================================
한국 연안 바운딩박스의 선박 위치(PositionReport)를 일정 시간 수신해
vessel_positions 테이블 적재용 SQL을 생성한다. 상주 프로세스 없이
스케줄 실행(권장 1시간 주기) 시마다 스냅샷을 축적하는 구조.

  환경변수: AISSTREAM_API_KEY (aisstream.io — GitHub 로그인 후 무료 발급)
  사용법:  python collect_ais_positions.py --sql [--seconds 90] [--max 350]
  출력:   sql/upload_ais.sql (48시간 경과분 정리 + 스냅샷 insert)

커버리지 유의: 지상파 AIS 특성상 연안 ~200km 이내만 수신됨 (원양 불가).
"""
import sys, os, json, time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import websocket

API_KEY = os.environ.get('AISSTREAM_API_KEY', '')
SQL_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'sql', 'upload_ais.sql')
# 한국 연안 (제주 남단 ~ 동해 북부, 서해 ~ 동해)
BBOX = [[[32.5, 124.0], [39.0, 131.5]]]
WS_URL = 'wss://stream.aisstream.io/v0/stream'


def q(v):
    if v is None or v == '':
        return 'null'
    return "'" + str(v).replace("'", "''") + "'"


def main():
    args = sys.argv[1:]
    def opt(name, default):
        for a in args:
            if a.startswith('--%s=' % name):
                return int(a.split('=')[1])
            if a == '--%s' % name:
                i = args.index(a)
                if i + 1 < len(args) and args[i + 1].isdigit():
                    return int(args[i + 1])
        return default
    seconds, cap = opt('seconds', 90), opt('max', 350)

    if not API_KEY:
        sys.exit('환경변수 AISSTREAM_API_KEY 미설정 — aisstream.io에서 무료 발급 후 '
                 'setx AISSTREAM_API_KEY "<키>" 로 등록하십시오.')

    latest = {}   # mmsi → row (최신 위치만 유지)
    got = [0]
    deadline = time.time() + seconds

    ws = websocket.create_connection(WS_URL, timeout=10)
    ws.send(json.dumps({
        'APIKey': API_KEY,
        'BoundingBoxes': BBOX,
        'FilterMessageTypes': ['PositionReport'],
    }))
    ws.settimeout(5)
    while time.time() < deadline:
        try:
            raw = ws.recv()
        except websocket.WebSocketTimeoutException:
            continue
        except Exception:
            break
        try:
            m = json.loads(raw)
        except ValueError:
            continue
        if m.get('MessageType') != 'PositionReport':
            if m.get('error'):
                sys.exit('[FAIL] AISStream 오류: %s' % m['error'])
            continue
        pr = (m.get('Message') or {}).get('PositionReport') or {}
        meta = m.get('MetaData') or {}
        mmsi = str(pr.get('UserID') or meta.get('MMSI') or '')
        lat, lng = pr.get('Latitude'), pr.get('Longitude')
        if not mmsi or lat is None or lng is None:
            continue
        got[0] += 1
        latest[mmsi] = {
            'mmsi': mmsi,
            'ship_name': (str(meta.get('ShipName') or '').strip() or None),
            'lat': round(float(lat), 5), 'lng': round(float(lng), 5),
            'sog': pr.get('Sog'), 'cog': pr.get('Cog'),
        }
    try:
        ws.close()
    except Exception:
        pass

    rows = list(latest.values())[:cap]
    if not rows:
        sys.exit('[FAIL] 수신 0건 — 키/네트워크/바운딩박스 확인')

    lines = [
        '-- 자동 생성: collect_ais_positions.py --sql (수신 %d건, 고유 선박 %d척)' % (got[0], len(rows)),
        "delete from public.vessel_positions where received_at < now() - interval '48 hours';",
        'insert into public.vessel_positions (mmsi, ship_name, lat, lng, sog, cog) values',
    ]
    vals = [
        '  (%s, %s, %s, %s, %s, %s)' % (q(r['mmsi']), q(r['ship_name']), r['lat'], r['lng'],
                                        'null' if r['sog'] is None else r['sog'],
                                        'null' if r['cog'] is None else r['cog'])
        for r in rows
    ]
    lines.append(',\n'.join(vals) + ';')
    with open(SQL_OUT, 'w', encoding='utf-8') as fp:
        fp.write('\n'.join(lines))
    print('[OK] %d초 수신 %d건 → 고유 %d척 → %s 생성 완료' % (seconds, got[0], len(rows), SQL_OUT))


if __name__ == '__main__':
    main()
