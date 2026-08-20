# TWL 물류 포털 — API 인터페이스 명세

> **v1.2 · 2026-08-19 개정**(v1.1 2026-08-03) — Edge Function 3종 → **6종**. §2.4 `carrier-track` · §2.5 `bl-watch` · §2.6 `notify-bl` 계약 신설.
>
> 본 문서는 실제 코드에서 확인된 인터페이스만 기술한다.
> 근거: `supabase/functions/track/index.ts` · `supabase/functions/send-code/index.ts` · `supabase/functions/datago/index.ts` · `supabase/functions/carrier-track/index.ts` · `supabase/functions/bl-watch/index.ts` · `supabase/functions/notify-bl/index.ts` · `scripts/collect_bl_watch.py` · `supabase/auth_setup.sql` · `sql/setup_history.sql` · `server.py` · `js/auth.js` · `js/cargo.js` · `js/data.js` · `js/data_berth.js` · `js/vessel.js` · `js/landing.js` · `js/status.js` · `js/weather.js` · `vessel.html` · `sql/setup_supabase*.sql` · `scripts/collect_*.py` · `scripts/upload_berth_sql_parts.py`

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

단, Edge Function `track`·`datago`·`carrier-track`·`bl-watch`·`notify-bl`은 `verify_jwt=false`로 배포되어 `js/cargo.js`·`js/vessel.js`·수집 스크립트가 **헤더 없이** 직접 `fetch`한다. 인증이 필요한 `bl-watch`는 Supabase JWT 대신 **앱 세션 토큰을 본문/쿼리로 받아 서버에서 `app_me` RPC 로 검증**한다(§2.5).

**권한 모델 (RLS)**

- 데이터 테이블(`pi_ports`, `pi_snapshot`, `pi_history`, `bs_terminals`, `bs_vessel_calls`, `bs_collect_log`, `freight_index`, `weather_history`, `vessel_positions`)은 RLS 활성 + `for select using (true)` 정책 → anon(publishable 키)은 **조회(select) 전용**. INSERT/UPDATE/DELETE 정책 없음.
- 인증 테이블(`app_users`, `app_sessions`, `email_codes`)은 RLS 활성 + **정책 없음** → anon 직접 접근 불가. 오직 `SECURITY DEFINER` RPC 함수를 통해서만 접근.
- 쓰기(적재)는 서버 측에서만: 수집 스크립트(`scripts/collect_*.py`, `scripts/upload_berth_sql_parts.py --rest`)는 환경변수 `SUPABASE_SERVICE_KEY`, Edge Function `send-code`는 시크릿 `SUPABASE_SERVICE_ROLE_KEY` 사용.
- 수집 스크립트는 `env_key()`로 환경변수가 상속되지 않은 경우 Windows 사용자 환경변수 레지스트리에서 키를 직접 읽는다(`setx` 직후 재시작 불필요).

---

## 2. Edge Functions

배포된 함수 **6종**: `track`(유니패스) · `send-code`(인증코드) · `datago`(data.go.kr 프록시) · `carrier-track`(선사 직접조회) · `bl-watch`(B/L 감시 등록) · `notify-bl`(변경 알림 메일).
전부 `verify_jwt=false` 이며, 6종 모두 CORS `Access-Control-Allow-Origin: *` + `OPTIONS` 프리플라이트를 처리한다.

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

### 2.3 `GET /functions/v1/datago` — data.go.kr 공용 프록시 (2026-08-03 신설 · 동일자 v5까지 확장·실조회 검증 완료)

- 배포 옵션: `verify_jwt=false`, CORS `*`, 허용 메서드 `GET, OPTIONS`
- 시크릿 의존: `DATA_GO_KR_KEY` — **2026-08-03 등록 완료, 15종 별칭 전부 실조회 검증(NORMAL_SERVICE)**. 미등록 시에는 조회 대신 발급 안내 `needKey`를 반환한다.
- 인증키는 **Decoding·Encoding 어느 형태를 등록해도 동작**한다. `URLSearchParams`가 값을 1회 인코딩하므로 Encoding 키를 그대로 쓰면 이중 인코딩되어 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(코드 30)가 나는데, `normalizeKey()`가 퍼센트 이스케이프를 감지해 1회 디코드한다.
- **별칭(alias) 화이트리스트** 방식 — 등록된 경로만 프록시하여 개방 프록시가 되는 것을 막는다. 신규 API 추가는 `ALIASES` 등록으로만 가능.

**허용 별칭 15종** (런타임 확인: `?api=list`)

| 그룹 | 별칭 | 업스트림 | JSON 파라미터 | 페이징 |
|---|---|---|---|---|
| 해수부 1192000 | `portmis`(선박 입출항 15006353) · `shipspec`(선박제원 15055851) · `vtscontrol`(관제 15006354) · `portstat`(항만별 입출항실적 15059059) · `teuimpexp`(수출입 컨테이너 15059131) · `teunation`(국가별 컨테이너 15057250) | `apis.data.go.kr/1192000/…` | 없음(XML 전용) → 함수가 JSON 변환 | `pageNo` |
| 인천공항 B551177 | `aircargo`(15095068) · `aircargoarr`/`aircargodep`(15113461) · `airschedarr`/`airscheddep`(15114086) | `apis.data.go.kr/B551177/…` | `type=json` | `pageNo` |
| 인천항만 B551504 | `incheonship` · `incheonctrl` (15157706) | `apis.data.go.kr/B551504/ipaShipEtryptTkoff/…` | 없음(XML 전용) | **`skipRow`/`endRow`** |
| 기상청 1360000 | `wthrwarn`(기상특보 15000415) · `wthrmid`(중기예보 15059468) | `apis.data.go.kr/1360000/…` | `dataType=JSON` | `pageNo` |

**요청 파라미터**

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `api` | 필수 | 위 별칭 중 하나. 특수값 `list`는 허용 별칭 목록만 반환(키 불필요) |
| 그 외 | 선택 | `api`를 제외한 빈 값 아닌 쿼리스트링을 업스트림에 그대로 전달 |

**업스트림 규격 파라미터** (실조회로 확인 — 이름이 틀리면 `INVALID_REQUEST_PARAMETER_ERROR` 코드 11)

| 별칭 | 필수 파라미터 |
|---|---|
| `portmis` · `vtscontrol` | `prtAgCd`(항만청코드, 예 `020`) · `sde`/`ede`(YYYYMMDD) · (선택) `clsgn`·`deGb` |
| `shipspec` | `vsslNm` 또는 `clsgn` |
| `portstat` · `teuimpexp` · `teunation` | **`sym`/`eym`**(YYYYMM, 소문자) |
| `aircargo` 계열 | (선택) `searchday`·`airport_code`·`flight_id`·`lang` |
| `incheonship` · `incheonctrl` | `arvlDtFrom`/`arvlDtTo` — **`YYYY-MM-DD` 하이픈 형식**(해수부 계열의 `YYYYMMDD`와 다름. 붙여 쓰면 오류 없이 0건이 반환되므로 주의) · (선택) `callLetter`·`ocCt`·`yr`·`serNo` |
| `wthrwarn` · `wthrmid` | `stnId`(지점, 예 `108`) · `wthrmid`는 `tmFc`(YYYYMMDDHHmm, 06/18시 발표분) 추가 |

- 기본값 보충: 별칭별 JSON 파라미터(위 표) · `numOfRows=30` · 페이징(`pageNo=1` 또는 `skipRow=0`+`endRow=numOfRows`). `serviceKey`는 서버가 주입한다. 타임아웃 25초.
- 인천항만공사 계열에 `pageNo`를 주입하면 업스트림이 코드 99(`Invalid parameter for function`)로 거부하므로 `paging: "row"`로 분기한다.

**응답 형태**

| 케이스 | HTTP | 본문 |
|---|---|---|
| 키 미등록 | 200 | `{"needKey": true, "guide": "data.go.kr 회원가입 → … DATA_GO_KR_KEY 로 등록"}` |
| 별칭 목록(`api=list`) | 200 | `{"needKey": <키 미등록 여부>, "allowed": [{"api":"portmis","note":"…"}, …]}` |
| 미등록 별칭 | 400 | `{"error": "unknown api alias", "allowed": [{"api":…,"note":…}, …]}` |
| 별칭 확장 | — | `supabase/functions/datago/index.ts`의 `ALIASES`에만 추가하고 재배포하면 화면 코드 수정 없이 늘어난다 |
| 정상 조회(JSON 업스트림) | 200 | `{"needKey": false, "api": "<별칭>", "format": "json", "data": {…}}` |
| 정상 조회(XML 업스트림) | 200 | `{"needKey": false, "api": "<별칭>", "format": "xml", "data": {…파싱 결과…}}` — `track`과 동일하게 루트 요소를 벗겨 반환 |
| 해석 실패 | 200 | `{"needKey": false, "api": "<별칭>", "format": "raw", "raw": "<원문 4000자>", "error": "…"}` |
| GET 외 메서드 | 405 | `{"error": "method"}` |
| 업스트림 예외 | 502 | `{"error": "조회 실패: …"}` |

> 해수부·인천항만 계열은 XML 전용이라 v1에서는 `data`가 비고 `raw`만 채워져 `js/vessel.js`가 결과를 표시하지 못했다. v2의 XML→JSON 변환으로 모든 별칭이 `data`를 채운다.

**호출 예시** (`js/vessel.js` 입출항 실적 조회 — 헤더 없음):

```
GET https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago?api=portmis&clsgn=<호출부호>&prtAgCd=<항만코드>&sde=20260801&ede=20260803
```

### 2.4 `GET /functions/v1/carrier-track` — 선사 직접 화물추적 프록시 (2026-08-11 신설 · ZIM 개통 2026-08-18)

- 배포 옵션: `verify_jwt=false`, CORS `*`, 허용 메서드 `GET, OPTIONS`
- 시크릿 의존: **무키 5사는 없음**(선사 공개 백엔드 JSON/HTML 사용). DCSA 계열은 키가 등록된 선사만 활성 — `ZIM_API_KEY`+`ZIM_CLIENT_ID`+`ZIM_CLIENT_SECRET`(등록 완료), `HMM_API_KEY` · `MAERSK_CONSUMER_KEY`(+`MAERSK_CLIENT_ID`/`MAERSK_CLIENT_SECRET`) · `HLAG_CLIENT_ID`/`HLAG_CLIENT_SECRET` · `CMACGM_API_KEY`(미등록)
- 지원 정책: `CARRIERS` 레지스트리에 등록되고 `ready()` 를 통과한 선사만 실조회하고, 그 외는 `supported:false` + 딥링크를 돌려준다(개방 프록시 방지 — `datago` 화이트리스트와 같은 사상). **키 등록만으로 다음 호출부터 live 로 승격**되며 화면·함수 재배포가 필요 없다.

**요청 파라미터**

| 파라미터 | 필수 | 설명 |
|---|---|---|
| `api` | 선택 | `list` 지정 시 조회 대신 **선사 목록**을 반환(다른 파라미터 무시) |
| `no` | 필수 | B/L 번호 — 영숫자 외 제거 후 **8~20자**. 위반 시 400 |
| `carrier` | 선택 | SCAC 4자. 생략하면 번호 프리픽스로 자동 감지(긴 프리픽스 우선, SITC 는 3자 `SIT` 특례) |

**응답 — `?api=list`** (화면·`bl-watch` 가 선사 목록의 단일 원천으로 사용)

```json
{ "live":     [ { "scac": "ONEY", "name": "ONE (Ocean Network Express)", "source": "ecomm.one-line.com" } ],
  "pending":  [ { "scac": "HDMU", "name": "HMM", "note": "API 키 등록 대기" } ],
  "deeplink": [ { "scac": "MSCU", "name": "MSC" } ] }
```

**응답 — 조회**

| 케이스 | HTTP | 본문 |
|---|---|---|
| 번호 형식 오류 | 400 | `{"error": "B/L 번호 형식이 아닙니다 (영숫자 8~20자)."}` |
| live 미지원(딥링크 폴백) | 200 | `{"carrier","carrierName","supported": false, "query":{"no"}, "deeplink": {"name","url"}}` — `url` 은 조회번호가 붙은 완성형 |
| 정상 조회 | 200 | `{"carrier","carrierName","supported": true, "query":{"no"}, "summary":{…}, "voyages":[…], "containers":[…], "fetchedAt","source"}` |
| 조회 결과 없음 | 200 | `{"supported": true, "error": "조회 결과가 없습니다 — 번호·선사를 확인하십시오.", "upstream": "<업스트림 원문>"}` |
| 업스트림 지연·오류 | 200 | `{"supported": true, "error": "선사 서버 응답이 지연되고 있습니다 — 잠시 후 다시 시도하십시오."}` (타임아웃 외에는 "조회에 실패했습니다") |
| GET 외 메서드 | 405 | `{"error": "method"}` |
| 그 밖의 예외 | 502 | `{"error": "조회 실패: …"}` |

> **어댑터 실패를 200으로 돌려주는 이유**: 화면은 실패해도 딥링크·안내를 그려야 하므로, 전송 계층 실패(502)와 **조회 계층 실패(200 + `error`)를 구분**한다. 호출자는 HTTP 상태가 아니라 `error` 필드 유무로 판정할 것.

**정규화 응답 계약** — 레거시 KLNET `FMS_API_*` 3레벨 구조를 계승한다.

| 레벨 | 필드 | 내용 |
|---|---|---|
| BL | `summary` | `blNo` · `por` · `pod` · `vessel` · `voyage`(선사에 따라 `bookingNo`·`place` 추가) — `FMS_API_MST` 상당 |
| 항차 | `voyages[]` | `{vessel, voyage, pol:{name,date,actual}, pod:{name,date,actual}}` — `FMS_API_TS` 상당. **N구간**(레거시의 2구간 절단 제약은 계승하지 않음) |
| 컨테이너 | `containers[]` | `{cntrNo, szTp, latest:{name,location,timeLocal}, events:[…], eventsSynthesized?}` — `FMS_API_CNTR` 상당 |
| 이벤트 | `containers[].events[]` | `{name, location, yard?, timeLocal, timeUtc?, actual}` — **`timeLocal`(항만 현지시각)이 기본 표시값**, `timeUtc` 는 보조. `actual` 은 실적/예정 구분. `"0"`·null 시각은 미발생으로 보고 필드를 생략한다(레거시 규약) |

- `eventsSynthesized:true` 는 선사가 컨테이너 게이트 이벤트를 주지 않아 **본선 구간(출항·입항)으로 합성**했다는 표시다(COSCO). 화면은 이 경우 "(본선 구간 기준)" 을 덧붙인다.
- 시각을 UTC 로 변환하지 않는다 — 선사가 주는 현지시각을 임의 변환하면 값이 왜곡되므로 문자열 원문을 그대로 전달하고, 표시 단계에서만 해석한다.

**호출 예시** (`js/cargo.js` — 헤더 없음)

```
GET https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/carrier-track?no=ONEYSELG97346400
GET https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/carrier-track?api=list
```

### 2.5 `GET|POST /functions/v1/bl-watch` — B/L 자동 감시 등록·해제·목록 (2026-08-11 신설 · 계정별 독립 2026-08-19)

- 배포 옵션: `verify_jwt=false`, CORS `*`, 허용 메서드 `GET, POST, OPTIONS`
- 시크릿 의존: `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`(자동 주입). 정적 사이트는 RLS 로 `bl_watch` 쓰기가 불가하므로 이 함수가 service_role 로 대행한다.
- **인증**: 모든 호출이 앱 세션 토큰을 싣고, 함수가 `POST /rest/v1/rpc/app_me` 로 **서버에서 신원을 검증**한다(§3.2). 클라이언트가 보낸 `created_by` 는 신뢰하지 않는다.

| 역할 | 조회 범위 | 쓰기 범위 |
|---|---|---|
| 일반 사용자 | 자기 등록분(`created_by=<본인>`)만 | 자기 등록분만 |
| 관리자(`role=admin`) | 전체 | 전체 |
| 비로그인·위조 토큰 | 빈 목록 + `needLogin:true` | 401 |

**요청 — GET**

| `action` | 파라미터 | 응답 |
|---|---|---|
| `list`(기본) | `token` · `q`(B/L 부분일치) · `carrier`(SCAC) · `active`(`all`\|`on`\|`off`) | `{total, me, admin, items:[…]}` — 각 item 은 `bl_watch` 행 + `mine`(내 등록분 여부) + `snapshot`(최신 `bl_snapshot` 1건) + `changes`(최근 변경 5건). 최대 2000행 |
| `detail` | `token` · `no` | `{mbl_no, changes:[…최근 50건], snapshots:[…최근 20건]}`. 소유자 목록에 없고 관리자도 아니면 403 |
| `carriers` | (토큰 불요) | `carrier-track?api=list` 를 그대로 프록시(8초 타임아웃, 실패 시에만 내장 목록 폴백) — **선사 목록을 두 곳에 하드코딩하지 않기 위함** |

**요청 — POST** (본문 JSON, 공통 필드 `action`·`token`)

| `action` | 본문 | 동작·응답 |
|---|---|---|
| `add` | `mbl_no` · `carrier?` · `notify_email?` · `memo?`(200자) · `term_months`(3\|6, 기본 3) | 등록/갱신 후 `{ok:true, item}`. 지원하지 않는 선사면 400 |
| `bulk` | `rows:[{mbl_no, term_months?, notify_email?, memo?}]` (**최대 500건**) + 상위 기본값 `term_months`·`notify_email` | `{ok:true, added, failed, results:[{mbl_no, ok, error?}]}` — 실패 사유는 `번호 형식 오류`·`중복`·`지원하지 않는 선사` |
| `remove` | `mbl_no` | 소유 검사 후 `active=false`. 대상이 없으면 403 `내가 등록한 화물이 아니거나 이미 해제되었습니다.` |
| `notify` | `mbl_no` · `notify_email`(빈 문자열이면 해제) | 알림 수신 주소만 변경 — 목록에서 바로 고치기 위한 액션이라 B/L 재조회가 필요 없다 |

**등록 규칙(코드 실측)**

- `mbl_no`: 영숫자 외 제거 후 대문자화, `^[A-Z0-9]{8,20}$` 위반 시 400.
- 선사 감지: `SIT` 3자 특례 후 앞 4자 SCAC. **`LIVE`(실조회 6사: ONEY·COSU·SMLM·EGLV·SITC·**ZIMU**) 또는 `DEEPLINK` 목록에 없으면 등록 자체가 거부**된다.
- 저장은 `on_conflict=mbl_no,created_by` upsert — **`bl_watch` 의 유일성은 (B/L, 계정) 복합키**이므로 같은 B/L 을 여러 계정이 각자 감시할 수 있다(2026-08-19 변경 전에는 `mbl_no` 단독 unique 라 나중 등록자가 남의 행을 덮어썼다).
- `expires_at` = 등록 시각 + `term_months`. 수집기가 이 시각을 지나면 조회 없이 `active=false` 로 자동 해제한다.

| 오류 | HTTP | 본문 |
|---|---|---|
| 토큰 없음·만료 (POST) | 401 | `{"error": "로그인이 필요합니다."}` |
| 소유자 아님 | 403 | `{"error": "내가 등록한 화물이 아닙니다."}` 등 |
| 번호 형식 | 400 | `{"error": "B/L 번호 형식이 아닙니다 (영숫자 8~20자)."}` |
| 미지원 선사 | 400 | `{"error": "지원하지 않는 선사입니다 — 번호에서 선사를 식별하지 못했습니다."}` |
| 알 수 없는 action | 400 | `{"error": "unknown action"}` |
| GET/POST 외 | 405 | `{"error": "method"}` |

```
GET  /functions/v1/bl-watch?action=list&token=<세션토큰>&active=on
POST /functions/v1/bl-watch     { "action": "add", "token": "<세션토큰>",
                                  "mbl_no": "ZIMUSEL71219430", "term_months": 6,
                                  "notify_email": "itt@twsc.co.kr" }
```

### 2.6 `POST /functions/v1/notify-bl` — 스케줄 변경 알림 메일 (2026-08-11 신설)

- 배포 옵션: `verify_jwt=false`, CORS `*`, 허용 메서드 `POST, OPTIONS`
- 시크릿 의존: `SMTP_HOST`, `SMTP_PORT`(기본 465), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — `send-code` 와 공유
- 호출자: 수집기 ⑧ `collect_bl_watch.py`(변경 감지 시) · ⑨ `canary_carriers.py`(이상 감지 시). 화면은 호출하지 않는다.

**요청 본문**

| 필드 | 필수 | 설명 |
|---|---|---|
| `email` | 필수 | 수신 주소(형식 검증) |
| `mbl_no` | 필수 | 식별자 — 제목·본문·딥링크에 사용 |
| `changes` | 필수 | `[{kind, field, old, new}]` — **빈 배열이면 400**(보낼 내용이 없는 메일 방지) |
| `carrier`·`vessel`·`voyage`·`por`·`pod`·`status` | 선택 | 요약 표에 표시 |
| `subject`·`intro`·`label` | 선택 | 제목·안내문·식별자 라벨 override(2026-08-14 추가) — B/L 스케줄 변경이 아닌 카나리아 점검 알림이 같은 발송 경로를 쓰되 고정 문구가 오해를 부르지 않게 하기 위함. 미지정이면 기존 문구 그대로 |

| 케이스 | HTTP | 본문 |
|---|---|---|
| 정상 | 200 | `{"ok": true, "sent": <changes 건수>}` |
| 이메일 형식 오류 | 400 | `{"error": "invalid email"}` |
| `mbl_no` 누락 | 400 | `{"error": "mbl_no required"}` |
| 변경 0건 | 400 | `{"error": "no changes"}` |
| POST 외 메서드 | 405 | `{"error": "method"}` |
| SMTP 미설정 | 503 | `{"error": "SMTP not configured"}` |
| 발송 예외 | 500 | `{"error": "<예외 문자열>"}` |

> **본문은 ASCII 전용이다.** denomailer 가 비Latin1 문자를 btoa 로 인코딩하다 실패하는 제약(`send-code` 에서 확인)이 있어, 한국어 필드명·상태값을 영문으로 매핑(`ETD (departure)`·`Loaded on vessel` 등)하고 접두 매핑으로 동적 문자열("터미널 접안(ETB) - BCT")까지 처리한 뒤, **남은 비ASCII 문자는 제거**해 어떤 값이 와도 인코딩이 깨지지 않게 한다. 새 알림 종류를 추가할 때 한국어 라벨을 그대로 넘기면 메일에서 글자가 사라지므로 매핑을 함께 등록할 것.

메일의 "Open Cargo Tracking" 버튼은 `cargo.html?no=<B/L>` 딥링크이며, 화면이 이 파라미터를 받아 즉시 조회를 실행한다.

---

## 3. RPC (PostgREST `POST /rest/v1/rpc/<함수명>`)

3.1~3.8은 `supabase/auth_setup.sql` 정의(인증 계열). 인증 계열 공통:

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

### 3.9 `berth_daily_counts(days int default 7)` — 데이터 RPC (2026-08-03 신설)

- 정의 위치가 다르다: `sql/setup_history.sql`. `language sql` **`stable`·`security invoker`** + `set search_path=public`, `grant execute … to anon, authenticated`.
- 반환 타입 `returns table(collected_date date, cnt bigint)` — `bs_vessel_calls`를 `collected_date >= current_date - days` 범위로 집계해 일별 적재 건수를 내림차순 반환.
- 도입 배경: PostgREST 집계(aggregate)가 비활성이라 클라이언트에서 일별 건수를 직접 구할 수 없다. `js/status.js`의 최근 7일 타임라인은 이 RPC의 **실적 기준**으로 판정한다(적재 로그 `bs_collect_log`가 누락돼도 화면이 '없음'으로 오표시되지 않음 — 2026-08-01 사례 대응).

```
POST /rest/v1/rpc/berth_daily_counts
{ "days": 7 }

GET  /rest/v1/rpc/berth_daily_counts?days=7      ← js/status.js 실제 패턴(공통 헤더 포함)
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
GET /rest/v1/rpc/berth_daily_counts?days=7        ← 최근 7일 타임라인(실적 기준, §3.9)
```

- 타임라인 판정 규칙: 실적(RPC 건수)이 있으면 ✓와 건수, 실적이 없고 실패 로그만 있으면 ✗. `bs_collect_log`는 실패 사유 표시용 보조 자료로만 쓰인다.
- 같은 화면의 외부 연동 헬스체크는 `/functions/v1/track`·`/functions/v1/datago`(둘 다 `needKey` 응답도 정상=키 대기로 판정)·`/functions/v1/send-code`(OPTIONS)를 호출한다.

### 4.6 자체 AIS 수신 위치 — `vessel_positions` (`js/vessel.js`)

```
GET /rest/v1/vessel_positions
  ?select=mmsi,ship_name,lat,lng,sog,cog,received_at
  &received_at=gt.<현재-2시간 ISO8601>
  &order=received_at.desc&limit=900
```

- 행 컬럼: `mmsi, ship_name, lat, lng, sog, cog, received_at` (적재는 스케줄 ⑤ 매시 30분, **48시간 보존**).
- 클라이언트는 최근 2시간 행을 받아 `mmsi` 기준 최신 1건만 남겨 Leaflet 지도에 마커로 표시하고 **5분 주기**로 재조회한다.

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
- 배포판(정적 호스팅)에서는 동일 업스트림을 Edge Function `datago?api=portmis`(§2.3)가 대신한다.

### 5.4 `GET /api/aircargo?flight_id=&airline=&from_time=&to_time=`

- 인천공항 화물편 도착(data.go.kr `StatusOfCargoFlights/getCargoArrivals`) 프록시. 고정값 `numOfRows=30, pageNo=1, type=json, lang=K`. 키·응답 규약은 5.3과 동일. 배포판 대체 경로는 `datago?api=aircargo`(§2.3).

---

## 6. 외부 API 인벤토리

| 외부 서비스 | 엔드포인트 | 인증 | 호출 주체 | 용도 |
|---|---|---|---|---|
| IMF PortWatch (ArcGIS) | `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Ports_Data/FeatureServer/0/query` | 불필요 | `scripts/collect_portinsight_api.py` (배치) | Focus 93개 항만 일별 portcalls·물동량 → PCI 산출 후 `pi_ports`/`pi_snapshot` 적재 |
| Open-Meteo Marine | `https://marine-api.open-meteo.com/v1/marine` | 불필요 | 브라우저 (`js/weather.js`, `js/status.js`) + `scripts/collect_weather_history.py` (배치) | 항만 파고·파주기 (부산신항·광양항·인천항, 브라우저 30분 주기 / 배치 6시간 주기 → `weather_history` 적재) |
| Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast` | 불필요 | 브라우저 (`js/weather.js`) + `scripts/collect_weather_history.py` (배치) | 풍속·돌풍 (`wind_speed_10m`, `wind_gusts_10m`) |
| AISStream | `wss://stream.aisstream.io/v0/stream` (WebSocket) | **필요** — `AISSTREAM_API_KEY` (aisstream.io 무료 발급, **2026-08-03 등록 완료**) | `scripts/collect_ais_positions.py` (배치, 매시 30분 90초 수신) | 자체 AIS 선박 위치 스냅샷 → `vessel_positions` 적재(48시간 보존) |
| 상하이해운거래소 (SSE) | `https://en.sse.net.cn/currentIndex?indexName=SCFI\|CCFI` | 불필요 (Referer 헤더 부착) | `scripts/collect_freight_index.py` (배치) | SCFI/CCFI 주간 지수 → `freight_index` 적재 |
| KOBC KCCI | `https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do` | 불필요 (HTML 파싱) | `scripts/collect_freight_index.py` (배치) | KCCI 주간 지수 → `freight_index` 적재 |
| VesselFinder 임베드 | `https://www.vesselfinder.com/aismap.js` (+ 딥링크 `/vessels?name=`) | 불필요 (공개 위젯) | 브라우저 (`vessel.html`, `js/vessel.js`) | Live AIS 지도 임베드·선박 실시간 위치 링크 |
| 관세청 UNIPASS | `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo` | **필요** — 발급 키(`crkyCn`), Edge 시크릿/환경변수 `UNIPASS_API_KEY` (**미등록 대기**) | Edge Function `track` / `server.py` (프록시) | 화물통관진행정보 (MBL/HBL) |
| data.go.kr 해수부 1192000 | `https://apis.data.go.kr/1192000/…` — `VsslEtrynd5/Info5`(입출항) · `SicsVsslManp3/Info3`(제원) · `CntlVssl2/Info`(관제) · `SsopVsslEtryndHarbor2/YM` · `SsopCargContnImxprt2/Ym` · `SsopCargContnNat2/Ym` | **필요** — `DATA_GO_KR_KEY` (**등록 완료 2026-08-03** — 활용신청 12종 승인·실조회 검증) | Edge Function `datago`(별칭 `portmis`·`shipspec`·`vtscontrol`·`portstat`·`teuimpexp`·`teunation`) / `server.py` (로컬 전용) | 본선 ATA/ATD·선박 제원·물동량 통계 |
| data.go.kr 인천공항 B551177 | `https://apis.data.go.kr/B551177/…` — `StatusOfCargoFlights/getCargoArrivals` · `StatusOfCargoFlightsDeOdp/*` · `StatusOfCgoFltSched/*` | **필요** — `DATA_GO_KR_KEY` (**등록 완료 2026-08-03**) | Edge Function `datago`(별칭 `aircargo`·`aircargoarr`·`aircargodep`·`airschedarr`·`airscheddep`) | 화물편 도착·출발·정기 스케줄 |
| data.go.kr 인천항만 B551504 | `https://apis.data.go.kr/B551504/ipaShipEtryptTkoff/…` | **필요** — `DATA_GO_KR_KEY` (**등록 완료 2026-08-03**) | Edge Function `datago`(별칭 `incheonship`·`incheonctrl`) | 인천항 선박 입출항·관제 |
| data.go.kr 기상청 1360000 | `https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList` · `MidFcstInfoService/getMidFcst` | **필요** — `DATA_GO_KR_KEY` (**등록 완료 2026-08-03**) | Edge Function `datago`(별칭 `wthrwarn`·`wthrmid`) | 기상특보 티커·중기예보 |

**키 현황 (2026-08-03 기준)**

| 키 | 보관 위치 | 상태 |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | PC 사용자 환경변수 | 등록 완료 — 07:30 선석 REST 적재(`upload_berth_sql_parts.py --rest`) 가동. 키를 PC에 두지 않는 원칙의 **유일한 예외**(무인 정시 적재를 위해 필요) |
| `AISSTREAM_API_KEY` | PC 사용자 환경변수 | 등록 완료 — 매시 30분 AIS 수신 가동 |
| `UNIPASS_API_KEY` | Supabase Edge 시크릿 | **미등록 대기** — 등록 즉시 코드 수정 없이 `track` 동작(현재는 `needKey` 안내 반환) |
| `DATA_GO_KR_KEY` | Supabase Edge 시크릿 | **등록 완료(2026-08-03)** — 활용신청 12종 승인 + 키 등록 후 `datago` 15종 별칭 전부 실조회 검증(NORMAL_SERVICE). Decoding/Encoding 형태 무관하게 동작 |

※ 그 밖의 외부 의존: 지도 타일 `basemaps.cartocdn.com`(Leaflet, `js/insight.js`·`js/vessel.js` AIS 지도), Deno 모듈 `deno.land/x/xml`·`deno.land/x/denomailer`(Edge Function 빌드 시). API 호출이 아니므로 표에서 제외.
