# TWL 물류 포털 — API 인터페이스 명세

> **v1.0 · 2026-07-31**
>
> 본 문서는 실제 코드에서 확인된 인터페이스만 기술한다.
> 근거: `supabase/functions/track/index.ts` · `supabase/functions/send-code/index.ts` · `supabase/auth_setup.sql` · `server.py` · `js/auth.js` · `js/cargo.js` · `js/data.js` · `js/data_berth.js` · `js/vessel.js` · `js/landing.js` · `js/status.js` · `js/weather.js` · `vessel.html` · `sql/setup_supabase*.sql` · `scripts/collect_*.py`

---

## 1. 개요 — 접근 규약

| 항목 | 값 |
|---|---|
| 베이스 URL | `https://kvmyiualdodcvreoqfin.supabase.co` |
| REST(테이블/RPC) | `/rest/v1/...` (PostgREST) |
| Edge Functions | `/functions/v1/...` (Deno) |
| 클라이언트 키 | `sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv` (publishable — 클라이언트 공개용) |

**공통 요청 헤더** (`/rest/v1/*` 및 `send-code` 호출 시 — `js/auth.js`·`js/data.js` 실제 패턴):

```
apikey: <publishable key>
Authorization: Bearer <publishable key>
Content-Type: application/json     (POST일 때)
```

단, Edge Function `track`은 `verify_jwt=false`로 배포되어 `js/cargo.js`가 **헤더 없이** 직접 `fetch`한다.

**권한 모델 (RLS)**

- 데이터 테이블(`pi_ports`, `pi_snapshot`, `bs_terminals`, `bs_vessel_calls`, `bs_collect_log`)은 RLS 활성 + `for select using (true)` 정책 → anon(publishable 키)은 **조회(select) 전용**. INSERT/UPDATE/DELETE 정책 없음.
- 인증 테이블(`app_users`, `app_sessions`, `email_codes`)은 RLS 활성 + **정책 없음** → anon 직접 접근 불가. 오직 `SECURITY DEFINER` RPC 함수를 통해서만 접근.
- 쓰기(적재)는 서버 측에서만: 수집 스크립트(`scripts/collect_*.py`)는 환경변수 `SUPABASE_SERVICE_KEY`, Edge Function `send-code`는 시크릿 `SUPABASE_SERVICE_ROLE_KEY` 사용.

---

## 2. Edge Functions

### 2.1 `GET /functions/v1/track` — 관세청 유니패스 화물통관진행정보 프록시

- 배포 옵션: `verify_jwt=false` (정적 사이트에서 헤더 없이 직접 호출)
- CORS: `Access-Control-Allow-Origin: *`, 허용 메서드 `GET, OPTIONS`
- 시크릿 의존: `UNIPASS_API_KEY` (미등록 시 조회 대신 발급 안내 `needKey` 반환)
- 업스트림: `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo` (파라미터 `crkyCn`, `blYy`, `mblNo`|`hblNo`, 타임아웃 25초, XML 응답을 JSON으로 변환)

**요청 파라미터**

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `type` | 선택 | `mbl` \| `hbl` (기본 `mbl`, 소문자 변환) |
| `no` | 필수 | B/L 번호 — 영숫자 외 문자 제거 후 **6자 이상**이어야 함 |
| `year` | 선택 | B/L 연도 4자리 (숫자 외 제거, 기본값: 현재 연도) |

**응답 형태** — 로컬 백엔드 `server.py /api/track`과 동일한 `{needKey|query|error|data}` 구조:

| 케이스 | HTTP | 본문 |
|---|---|---|
| 키 미등록 | 200 | `{"needKey": true, "guide": "유니패스 … UNIPASS_API_KEY 로 등록"}` |
| 입력 오류 | 200 | `{"error": "유효한 type(mbl\|hbl)과 B/L 번호를 입력하십시오."}` |
| 정상 조회 | 200 | `{"needKey": false, "query": {"type","no","year"}, "error": null 또는 유니패스 오류문자열, "data": {…XML 변환 객체…}}` |
| GET 외 메서드 | 405 | `{"error": "method"}` |
| 업스트림/파싱 예외 | 502 | `{"error": "조회 실패: …"}` |

※ 유니패스 측 오류(`ntceInfo`/`errMsgCn`)는 HTTP 200에 `error` 필드로 전달된다.

**호출 예시** (`js/cargo.js` 실제 패턴 — 헤더 없음):

```
GET https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/track?type=mbl&no=HDMU1234567&year=2026
```

### 2.2 `POST /functions/v1/send-code` — 이메일 인증코드 발송

- 배포 옵션: `verify_jwt=false` (자체 레이트리밋), CORS `*`, 허용 메서드 `POST, OPTIONS`
- 시크릿 의존: `SMTP_HOST`, `SMTP_PORT`(기본 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` + `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- 동작: 6자리 난수 코드 생성 → `email_codes` 테이블 저장(service role) → denomailer SMTP(TLS)로 발송. 코드 유효시간 10분(`email_codes.expires_at` 기본값).

**요청 본문**

```json
{ "login": "user@example.com", "purpose": "signup" }
```

| 필드 | 필수 | 설명 |
|---|---|---|
| `login` | 필수 | 이메일 — 정규식 검증, trim + 소문자 변환 |
| `purpose` | 선택 | `signup`(기본) \| `reset` |

**레이트리밋**: 동일 `login`+`purpose` 조합으로 **최근 60초 내** 발송 이력이 있으면 429.

**응답·오류코드**

| 케이스 | HTTP | 본문 |
|---|---|---|
| 정상 | 200 | `{"ok": true}` |
| 이메일 형식 오류 | 400 | `{"error": "invalid email"}` |
| purpose 오류 | 400 | `{"error": "invalid purpose"}` |
| POST 외 메서드 | 405 | `{"error": "method"}` |
| 60초 내 재요청 | 429 | `{"error": "Please wait a minute before requesting a new code."}` |
| 코드 저장 실패 | 500 | `{"error": "code save failed"}` |
| 기타 예외 | 500 | `{"error": "<예외 문자열>"}` |
| SMTP 미설정 | 503 | `{"error": "SMTP not configured"}` |

**호출 예시** (`js/auth.js` `edge()` — 공통 헤더 포함):

```
POST /functions/v1/send-code
{ "login": "user@twsc.co.kr", "purpose": "reset" }
```

---

## 3. RPC (PostgREST `POST /rest/v1/rpc/<함수명>`)

`supabase/auth_setup.sql` 정의. 전 함수 공통:

- `language plpgsql` **`SECURITY DEFINER`** + `set search_path=public, extensions`
- `grant execute … to anon` — publishable 키로 호출 가능 (공통 헤더 필수)
- 반환 타입 `json` (`app_logout`만 `void`) — **오류도 HTTP 200 + `{"error": …}` 본문**으로 전달됨
- 비밀번호는 bcrypt(`crypt`/`gen_salt('bf')`)로만 저장·검증, 세션 토큰은 uuid·유효기간 30일(`app_sessions.expires_at` 기본값)

### 3.1 `app_login(p_login text, p_password text)`

- 로그인: 소문자/trim 정규화 → bcrypt 검증 → `status='approved'`인 계정만 세션 토큰 발급.
- 반환: 성공 `{"ok":true,"token":"<uuid>","role":"user|admin","login":"…","name":"…"}` / 자격 오류 `{"error":"아이디 또는 비밀번호가 올바르지 않습니다"}` / 미승인 `{"status":"pending|rejected","error":"승인 대기중입니다…" 또는 "승인되지 않았거나 거부된 계정입니다."}`

```
POST /rest/v1/rpc/app_login
{ "p_login": "user@twsc.co.kr", "p_password": "Secret#1234" }
```

### 3.2 `app_me(p_token uuid)`

- 세션 유효성 확인 (만료 검사 `expires_at > now()`).
- 반환: `{"ok":true,"role","login","name","status"}` / `{"error":"세션이 만료되었습니다"}`

```
POST /rest/v1/rpc/app_me
{ "p_token": "3f2a…-uuid" }
```

### 3.3 `app_logout(p_token uuid)` → `void`

- 세션 행 삭제. 반환 본문 없음.

```
POST /rest/v1/rpc/app_logout
{ "p_token": "3f2a…-uuid" }
```

### 3.4 `app_signup_verified(p_login text, p_password text, p_code text, p_name text default null)`

- 가입 신청: 이메일 인증코드(`purpose='signup'`, 미소모, 미만료) 확인 → 중복 아이디 검사 → 코드 소모 처리 → `status='pending'` 사용자 생성 (관리자 승인 전 로그인 불가).
- 검증: 아이디 4자 이상, **비밀번호 8자 이상**.
- 반환: `{"ok":true,"status":"pending"}` / `{"error":"아이디(이메일)를 확인하세요" | "비밀번호는 8자 이상이어야 합니다" | "인증코드가 올바르지 않거나 만료되었습니다" | "이미 가입 신청되었거나 사용 중인 아이디입니다"}`

```
POST /rest/v1/rpc/app_signup_verified
{ "p_login": "new@twsc.co.kr", "p_password": "Secret#1234", "p_code": "483920", "p_name": "홍길동" }
```

### 3.5 `app_reset_with_code(p_login text, p_code text, p_new_password text)`

- 비밀번호 재설정: 인증코드(`purpose='reset'`) 확인 → 코드 소모 → bcrypt 재해시.
- 검증: **새 비밀번호 8자 이상**, 가입된 아이디여야 함.
- 반환: `{"ok":true}` / `{"error":"비밀번호는 8자 이상이어야 합니다" | "인증코드가 올바르지 않거나 만료되었습니다" | "가입되지 않은 아이디입니다"}`

```
POST /rest/v1/rpc/app_reset_with_code
{ "p_login": "user@twsc.co.kr", "p_code": "112233", "p_new_password": "NewSecret#99" }
```

### 3.6 `app_admin_list(p_token uuid)` — 관리자 전용

- 토큰 세션의 `role='admin'` 확인 후 전체 사용자 목록 반환 (가입일 내림차순).
- 반환: `[{"id","login","name","status","role","created_at"}, …]` (없으면 `[]`) / `{"error":"관리자 권한이 필요합니다"}`

```
POST /rest/v1/rpc/app_admin_list
{ "p_token": "<admin 세션 uuid>" }
```

### 3.7 `app_admin_set_status(p_token uuid, p_id uuid, p_status text)` — 관리자 전용

- 사용자 승인/거부/보류 전환. `p_status ∈ ('approved','rejected','pending')`. 대상이 `role='admin'`인 행은 변경 제외. `approved` 전환 시 `approved_at=now()` 기록.
- 반환: `{"ok":true}` / `{"error":"관리자 권한이 필요합니다" | "잘못된 상태값"}`

```
POST /rest/v1/rpc/app_admin_set_status
{ "p_token": "<admin uuid>", "p_id": "<user uuid>", "p_status": "approved" }
```

### 3.8 `app_admin_reset_pw(p_token uuid, p_id uuid, p_new_password text)` — 관리자 전용

- 임의 사용자 비밀번호 강제 재설정. 검증: **6자 이상** (일반 재설정의 8자와 다름).
- 반환: `{"ok":true}` / `{"error":"관리자 권한이 필요합니다" | "비밀번호는 6자 이상이어야 합니다"}`

```
POST /rest/v1/rpc/app_admin_reset_pw
{ "p_token": "<admin uuid>", "p_id": "<user uuid>", "p_new_password": "Temp#123" }
```

---

## 4. 테이블 조회 API (PostgREST `GET /rest/v1/<table>`)

anon 조회 전용(RLS select-only). 공통 헤더 필수. 웹이 실제 사용하는 쿼리 패턴:

### 4.1 Port Insight — `pi_ports` / `pi_snapshot` (`js/data.js`)

```
GET /rest/v1/pi_ports?select=*
GET /rest/v1/pi_snapshot?select=*&id=eq.1
```

- `pi_ports` 행: `name_en, name_ko, country_cd, region_cd, lat, lng, tpfs, delay_h, waiting_cnt, berthed_cnt`
- `pi_snapshot`(단일 행 id=1): `total_ports, tpfs, critical_ports, global_risk, avg_delay_h, distribution(JSON), period_start, period_end, updated_at`
- 클라이언트 타임아웃 8초 — 실패 시 내장 시드 시뮬레이션으로 자동 폴백. 45초 주기 폴링.

### 4.2 선석배정 — `bs_vessel_calls` 최신 수집일 2단 조회 (`js/data_berth.js`)

```
1) GET /rest/v1/bs_vessel_calls?select=collected_date&order=collected_date.desc&limit=1
2) GET /rest/v1/bs_vessel_calls?select=*&collected_date=eq.<1의 값>&order=eta.asc.nullslast&limit=1000
```

- 행 컬럼(사용분): `terminal_cd, sub_terminal, berth, carrier, vessel_name, voyage, route, cct, eta, etd, discharge_qty, load_qty, shift_qty, status, collected_date`

### 4.3 선명/항차 검색 — `or=ilike` 패턴 (`js/vessel.js`)

```
GET /rest/v1/bs_vessel_calls
  ?select=collected_date,terminal_cd,berth,vessel_name,voyage,carrier,eta,etd,status
  &or=(vessel_name.ilike.*<검색어>*,voyage.ilike.*<검색어>*)
  &order=collected_date.desc,eta.asc&limit=12
```

- 주의: 쉼표·괄호·따옴표·백슬래시는 PostgREST `or=()` 필터 문법을 깨뜨려 400을 유발하므로 클라이언트에서 검색어 조립 전 제거한다(`q.replace(/[,()"'\\]/g, ' ')`).

### 4.4 해상운임지수 — `freight_index` (`js/landing.js`)

```
GET /rest/v1/freight_index?select=index_code,route,value,pct_change,pub_date&order=pub_date.desc&limit=60
```

- 클라이언트가 최신 `pub_date` 행만 필터해 SCFI `COMPOSITE`, CCFI `COMPOSITE`/`KOREA`/`EUROPE`을 표시.

### 4.5 수집 상태 점검 (`js/status.js`)

```
GET /rest/v1/pi_snapshot?select=period_end,updated_at,tpfs&id=eq.1
GET /rest/v1/freight_index?select=pub_date,value,index_code,route&order=pub_date.desc&limit=20
GET /rest/v1/bs_collect_log?select=*&order=created_at.desc&limit=14
```

---

## 5. 로컬 백엔드 (`server.py`, `http://localhost:8090` 전용)

`python server.py`(또는 `start_server.bat`)로 기동하는 정적 파일 + 프록시 서버. 포트는 환경변수 `PORT`(기본 8090). 배포판(정적 호스팅)에서는 사용되지 않으며, `js/cargo.js`가 `localhost`/`file:` 환경에서만 `/api/track`으로 라우팅한다.

### 5.1 `GET /api/track?type=mbl|hbl&no=<번호>&year=YYYY`

- Edge Function `track`과 동일한 `{needKey|query|error|data}` 응답. 키는 **환경변수** `UNIPASS_API_KEY`.
- 차이점: `year` 미지정 시 기본값 `'2026'`(하드코딩), 정상/입력오류 200 · 예외 502.

### 5.2 `GET /api/searoute?olng=&olat=&dlng=&dlat=`

- python `searoute` 패키지로 해상 최단경로 계산 (`units='naut'`).
- 응답: 200 `{"nm": <해리, 소수1자리>, "coords": [[lng,lat], …]}` / 502 `{"error": "경로 계산 실패: …"}`

### 5.3 `GET /api/portmis?clsgn=&prtAgCd=&fromDt=&toDt=`

- 해수부 선박 입출항(data.go.kr `VsslEtrynd5/Info5`) 프록시. 파라미터는 있는 것만 전달, 고정값 `numOfRows=30, pageNo=1, type=json`.
- 키: 환경변수 `DATA_GO_KR_KEY`. 미설정 시 200 `{"needKey": true, "guide": …}` / 정상 200 `{"needKey": false, "data": …}` / 예외 502 `{"error": …}`.

### 5.4 `GET /api/aircargo?flight_id=&airline=&from_time=&to_time=`

- 인천공항 화물편 도착(data.go.kr `StatusOfCargoFlights/getCargoArrivals`) 프록시. 고정값 `numOfRows=30, pageNo=1, type=json, lang=K`. 키·응답 규약은 5.3과 동일.

---

## 6. 외부 API 인벤토리

| 외부 서비스 | 엔드포인트 | 인증 | 호출 주체 | 용도 |
|---|---|---|---|---|
| IMF PortWatch (ArcGIS) | `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query` | 불필요 | `scripts/collect_portinsight_api.py` (배치) | Focus 93개 항만 일별 portcalls·물동량 → PCI 산출 후 `pi_ports`/`pi_snapshot` 적재 |
| Open-Meteo Marine | `https://marine-api.open-meteo.com/v1/marine` | 불필요 | 브라우저 (`js/weather.js`, `js/status.js`) | 항만 파고·파주기 (부산신항·광양항·인천항, 30분 주기) |
| Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast` | 불필요 | 브라우저 (`js/weather.js`) | 풍속·돌풍 (`wind_speed_10m`, `wind_gusts_10m`) |
| 상하이해운거래소 (SSE) | `https://en.sse.net.cn/currentIndex?indexName=SCFI\|CCFI` | 불필요 (Referer 헤더 부착) | `scripts/collect_freight_index.py` (배치) | SCFI/CCFI 주간 지수 → `freight_index` 적재 |
| KOBC KCCI | `https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do` | 불필요 (HTML 파싱) | `scripts/collect_freight_index.py` (배치) | KCCI 주간 지수 → `freight_index` 적재 |
| VesselFinder 임베드 | `https://www.vesselfinder.com/aismap.js` (+ 딥링크 `/vessels?name=`) | 불필요 (공개 위젯) | 브라우저 (`vessel.html`, `js/vessel.js`) | Live AIS 지도 임베드·선박 실시간 위치 링크 |
| 관세청 UNIPASS | `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo` | **필요** — 발급 키(`crkyCn`), Edge 시크릿/환경변수 `UNIPASS_API_KEY` | Edge Function `track` / `server.py` (프록시) | 화물통관진행정보 (MBL/HBL) |
| data.go.kr 선박 입출항 | `http://apis.data.go.kr/1192000/VsslEtrynd5/Info5` | **필요** — `DATA_GO_KR_KEY` | `server.py` (로컬 전용) | 본선 ATA/ATD 확인 |
| data.go.kr 인천공항 화물편 | `http://apis.data.go.kr/B551177/StatusOfCargoFlights/getCargoArrivals` | **필요** — `DATA_GO_KR_KEY` | `server.py` (로컬 전용) | 화물편 도착 현황 |

※ 그 밖의 외부 의존: 지도 타일 `basemaps.cartocdn.com`(Leaflet, `js/insight.js`), Deno 모듈 `deno.land/x/xml`·`deno.land/x/denomailer`(Edge Function 빌드 시). API 호출이 아니므로 표에서 제외.
