# -*- coding: utf-8 -*-
"""
TWL 물류 포털 로컬 서버 (정적 파일 + 화물추적 API 프록시)
=====================================================
  python server.py            → http://localhost:8090
  (start_server.bat 이 이 파일을 실행)

백엔드 엔드포인트:
  GET /api/track?type=mbl|hbl&no=<번호>&year=YYYY
    - 관세청 유니패스 화물통관진행정보 OpenAPI 프록시 (해상·항공 수입 공통)
    - 인증키: 환경변수 UNIPASS_API_KEY (유니패스 > Open API 신청 후 발급)
    - 키 미설정 시 {"needKey": true} 반환 (프런트에서 발급 안내 표시)
"""
import io, json, os, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('PORT', '8090'))  # 기본 8090, 병행 실행 시 PORT 환경변수로 변경 가능
UNIPASS_KEY = os.environ.get('UNIPASS_API_KEY', '')
UNIPASS_URL = 'https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo'
# 공공데이터포털(data.go.kr) 인증키 — 활용신청(자동승인) 후 발급되는 일반 인증키(Encoding 아님, Decoding 키 권장)
DATAGO_KEY = os.environ.get('DATA_GO_KR_KEY', '')
PORTMIS_URL = 'http://apis.data.go.kr/1192000/VsslEtrynd5/Info5'                       # 해수부 선박 입출항
AIRCARGO_URL = 'http://apis.data.go.kr/B551177/StatusOfCargoFlights/getCargoArrivals'  # 인천공항 화물편 도착
DATAGO_GUIDE = ('공공데이터포털(data.go.kr) 회원가입 → 해당 API 활용신청(자동승인) → 발급 키를 '
                '환경변수 DATA_GO_KR_KEY 로 설정 후 서버 재시작 (선박운항정보 VsslEtrynd5, 인천공항 화물편 StatusOfCargoFlights 각각 신청 필요)')


def xml_to_obj(node):
    """XML → dict/list 관대 변환 (스키마 변화에 안전)"""
    kids = list(node)
    if not kids:
        return (node.text or '').strip()
    out = {}
    for k in kids:
        v = xml_to_obj(k)
        if k.tag in out:
            if not isinstance(out[k.tag], list):
                out[k.tag] = [out[k.tag]]
            out[k.tag].append(v)
        else:
            out[k.tag] = v
    return out


def track_unipass(kind, no, year):
    if not UNIPASS_KEY:
        return {'needKey': True,
                'guide': '유니패스(unipass.customs.go.kr) 로그인 → Open API 사용신청(화물통관진행정보) → 발급 키를 환경변수 UNIPASS_API_KEY 로 설정 후 서버 재시작'}
    params = {'crkyCn': UNIPASS_KEY, 'blYy': year}
    params['mblNo' if kind == 'mbl' else 'hblNo'] = no
    url = UNIPASS_URL + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'TWL-Portal/1.0'})
    with urllib.request.urlopen(req, timeout=25) as r:
        raw = r.read().decode('utf-8', 'replace')
    root = ET.fromstring(raw)
    obj = xml_to_obj(root)
    # 오류 메시지 노출 (인증 실패 등)
    err = obj.get('ntceInfo') or obj.get('errMsgCn')
    return {'needKey': False, 'query': {'type': kind, 'no': no, 'year': year},
            'error': err if isinstance(err, str) and err else None, 'data': obj}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == '/api/searoute':
            q = urllib.parse.parse_qs(parsed.query)
            try:
                olng, olat = float(q['olng'][0]), float(q['olat'][0])
                dlng, dlat = float(q['dlng'][0]), float(q['dlat'][0])
                import searoute as sr
                rt = sr.searoute((olng, olat), (dlng, dlat), units='naut')
                body = {'nm': round(rt['properties']['length'], 1),
                        'coords': rt['geometry']['coordinates']}
                data = json.dumps(body).encode('utf-8')
                self.send_response(200)
            except Exception as e:
                data = json.dumps({'error': '경로 계산 실패: %s' % e}, ensure_ascii=False).encode('utf-8')
                self.send_response(502)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if parsed.path in ('/api/portmis', '/api/aircargo'):
            # data.go.kr 프록시 — 키 미설정 시 발급 안내 반환 (UNIPASS 프록시와 동일 UX)
            q = urllib.parse.parse_qs(parsed.query)
            try:
                if not DATAGO_KEY:
                    body = {'needKey': True, 'guide': DATAGO_GUIDE}
                elif parsed.path == '/api/portmis':
                    # 선박 입출항: 호출부호(clsgn) 또는 항구코드로 본선 ATA/ATD 확인
                    params = {'serviceKey': DATAGO_KEY, 'numOfRows': '30', 'pageNo': '1', 'type': 'json'}
                    for k in ('clsgn', 'prtAgCd', 'fromDt', 'toDt'):
                        if q.get(k):
                            params[k] = q[k][0]
                    url = PORTMIS_URL + '?' + urllib.parse.urlencode(params)
                    with urllib.request.urlopen(urllib.request.Request(url), timeout=25) as r:
                        body = {'needKey': False, 'data': json.loads(r.read().decode('utf-8', 'replace'))}
                else:
                    # 인천공항 화물편 도착 현황: 편명/항공사 필터
                    params = {'serviceKey': DATAGO_KEY, 'numOfRows': '30', 'pageNo': '1', 'type': 'json', 'lang': 'K'}
                    for k in ('flight_id', 'airline', 'from_time', 'to_time'):
                        if q.get(k):
                            params[k] = q[k][0]
                    url = AIRCARGO_URL + '?' + urllib.parse.urlencode(params)
                    with urllib.request.urlopen(urllib.request.Request(url), timeout=25) as r:
                        body = {'needKey': False, 'data': json.loads(r.read().decode('utf-8', 'replace'))}
                data = json.dumps(body, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
            except Exception as e:
                data = json.dumps({'error': '조회 실패: %s' % e}, ensure_ascii=False).encode('utf-8')
                self.send_response(502)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if parsed.path == '/api/track':
            q = urllib.parse.parse_qs(parsed.query)
            kind = (q.get('type', ['mbl'])[0] or 'mbl').lower()
            no = re.sub(r'[^A-Za-z0-9]', '', (q.get('no', [''])[0] or ''))
            year = re.sub(r'[^0-9]', '', (q.get('year', [''])[0] or ''))[:4] or '2026'
            try:
                if kind not in ('mbl', 'hbl') or len(no) < 6:
                    body = {'error': '유효한 type(mbl|hbl)과 B/L 번호를 입력하십시오.'}
                else:
                    body = track_unipass(kind, no, year)
                data = json.dumps(body, ensure_ascii=False).encode('utf-8')
                self.send_response(200)
            except Exception as e:
                data = json.dumps({'error': '조회 실패: %s' % e}, ensure_ascii=False).encode('utf-8')
                self.send_response(502)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # 콘솔 소음 억제


if __name__ == '__main__':
    print('TWL 포털 서버: http://localhost:%d  (UNIPASS 키 %s)' % (PORT, '설정됨' if UNIPASS_KEY else '미설정 — /api/track 은 발급 안내 반환'))
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
