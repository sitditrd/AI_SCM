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

종료 코드: 0 정상 / 1 설정 오류(키 미등록) / 2 접속·핸드셰이크 실패
          3 업스트림 무응답 — 접속·구독은 되나 서버가 프레임을 전혀 안 보냄
             (aisstream.io는 BETA·SLA 없음. 이 경우 로컬 조치 사항 없음)
"""
import sys, os, json, time

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import websocket


def env_key(name):
    """환경변수 → (Windows) 사용자 환경변수 레지스트리 순으로 조회.
    setx 직후 기존 프로세스는 갱신된 환경을 상속하지 못하므로 레지스트리를 폴백으로 읽는다."""
    v = os.environ.get(name, '')
    if v or os.name != 'nt':
        return v
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as k:
            return winreg.QueryValueEx(k, name)[0] or ''
    except Exception:
        return ''


API_KEY = env_key('AISSTREAM_API_KEY')
SQL_OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       'sql', 'upload_ais.sql')
# 한국 연안 (제주 남단 ~ 동해 북부, 서해 ~ 동해)
BBOX = [[[32.5, 124.0], [39.0, 131.5]]]
WS_URL = 'wss://stream.aisstream.io/v0/stream'


def die(code, msg):
    """종료 코드를 구분해 실패 사유를 분류한다 (sys.exit(str)은 항상 1이라 쓰지 않음)."""
    sys.stderr.write(msg + '\n')
    sys.exit(code)


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
        die(1, '환경변수 AISSTREAM_API_KEY 미설정 — aisstream.io에서 무료 발급 후 '
               'setx AISSTREAM_API_KEY "<키>" 로 등록하십시오.')

    latest = {}   # mmsi → row (최신 위치만 유지)
    got = [0]
    frames = [0]      # 종류 불문 수신 프레임 수 — 업스트림 무응답 판별용
    closed = ['']     # 서버가 연결을 끊은 사유
    deadline = time.time() + seconds

    try:
        ws = websocket.create_connection(WS_URL, timeout=10)
    except websocket.WebSocketBadStatusException as e:
        # 429/503 등 — 엣지(envoy)가 핸드셰이크 단계에서 거부. 재시도해도 대개 동일.
        die(2, '[FAIL/2] AISStream 핸드셰이크 거부: %s '
               '— 서버측 rate limit/장애로 로컬 조치 불가' % e)
    except Exception as e:
        die(2, '[FAIL/2] AISStream 접속 실패: %s: %s' % (type(e).__name__, e))

    # 구독 메시지는 접속 후 3초 이내 전송 필수 (AISStream 규격)
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
        except Exception as e:
            closed[0] = '%s: %s' % (type(e).__name__, e)
            break
        frames[0] += 1
        try:
            m = json.loads(raw)
        except ValueError:
            continue
        if m.get('MessageType') != 'PositionReport':
            if m.get('error'):
                die(2, '[FAIL/2] AISStream 오류 응답: %s' % m['error'])
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
        if frames[0] == 0:
            # 접속·구독은 성립했는데 어떤 프레임도 오지 않은 상태.
            # 키/네트워크/바운딩박스로는 설명되지 않는다(전세계 bbox·무필터에서도 동일).
            # aisstream.io 업스트림 무응답으로 분류 — 로컬에서 고칠 수 있는 것이 없다.
            die(3, '[SKIP/3] AISStream 업스트림 무응답 — %d초간 프레임 0개'
                   '(접속·구독 정상, 서버 미송신). %s로컬 설정 문제 아님, 유입 재개 대기.'
                % (seconds, ('연결 종료 사유=%s. ' % closed[0]) if closed[0] else ''))
        die(3, '[SKIP/3] 위치 메시지 0건 — 프레임 %d개는 수신됨(다른 타입). '
               '바운딩박스 내 선박 부재 가능성.' % frames[0])

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
