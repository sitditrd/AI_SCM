# TWL Control Tower — 아키텍처 문서

**v1.0 · 2026-07-31** · 태웅로직스 IT · 문의 itt@twsc.co.kr

> 근거 문서: `README.md` · `docs/03-architecture/상세기술서_TWL물류포털.md` · `docs/06-operations/스케줄러_체계.md` · `sql/setup_supabase.sql` · `sql/setup_supabase_berth.sql` · `supabase/auth_setup.sql` · `netlify.toml` · `.github/workflows/deploy-pages.yml`

---

## 1. 시스템 개요

TWL Control Tower는 항만 혼잡도(PCI)·선석배정·선박 위치·화물 추적·경로 분석·해외 스케줄을 제공하는 사내 물류 관제 포털이다. 시스템은 **3계층으로 분리**되며, 각 계층은 Supabase를 경계로 서로 독립적으로 동작한다.

| 계층 | 구성 | 결합 방식 |
|---|---|---|
| **수집(배치)** | Python 수집기 4종 + 스케줄러 4개(Cowork/Claude 앱 내장) | `--sql` 모드로 SQL 파일 생성 → Supabase MCP로 적재(쓰기) |
| **저장** | Supabase PostgreSQL (프로젝트 `kvmyiualdodcvreoqfin`) | RLS로 읽기/쓰기 권한 분리 |
| **표현(정적 웹)** | 빌드 없는 순수 HTML/CSS/JS — GitHub Pages·Netlify | publishable key로 select만, 45초 폴링 |

분리 원칙의 효과: 웹은 빌드·서버 없이 `git pull`만으로 서빙 가능하고, 수집 PC와 웹 배포가 서로를 몰라도 Supabase를 통해 연계된다. Supabase 장애 시 각 페이지는 정적 시드로 폴백하고 오프라인 배너를 표시한다.

---

## 2. 시스템 구성도

```mermaid
flowchart LR
    subgraph SRC["외부 데이터 소스"]
        T16["터미널 사이트 16곳<br/>(선석배정 공표)"]
        PW["IMF PortWatch<br/>(ArcGIS REST)"]
        SSE["상하이해운거래소<br/>(SCFI·CCFI JSON)"]
        OM["Open-Meteo Marine"]
        VF["VesselFinder AIS"]
        UNI["관세청 UNIPASS"]
    end

    subgraph SCH["스케줄러 4종 (배치 계층)"]
        S1["① 06:00 매일 · Cowork 앱<br/>터미널 수집 → 통합 xlsx"]
        S2["② 08:03 매일 · Claude 앱<br/>berth-upload-supabase<br/>파싱 → SQL 생성 → MCP 적재"]
        S3["③ 08:44 매일 · Claude 앱<br/>portinsight-daily-update<br/>PCI 재산출"]
        S4["④ 월·금 17:02 · Claude 앱<br/>freight-index-update"]
    end

    subgraph SB["Supabase (kvmyiualdodcvreoqfin)"]
        DB[("PostgreSQL<br/>bs_* · pi_* · freight_index<br/>app_users · app_sessions · email_codes")]
        EF1["Edge Function send-code<br/>(denomailer + SMTP)"]
        EF2["Edge Function track<br/>(UNIPASS 프록시)"]
    end

    WEB["정적 웹 포털<br/>GitHub Pages(주) · Netlify(미러)<br/>HTML/CSS/JS · 빌드 없음"]

    T16 --> S1
    S1 -- "통합 xlsx<br/>(D:\터미널 스케쥴 정보)" --> S2
    PW --> S3
    SSE --> S4
    S2 -- "bs_vessel_calls·bs_collect_log" --> DB
    S3 -- "pi_ports·pi_snapshot" --> DB
    S4 -- "freight_index" --> DB
    S2 -. "국내 3항 실측 → ③ 보정" .-> S3
    DB -- "45초 폴링·publishable key<br/>(RLS select-only)" --> WEB
    WEB -- "인증코드 발송 요청" --> EF1
    WEB -- "B/L 조회" --> EF2
    EF2 --> UNI
    OM -- "브라우저 직접 fetch (CORS)" --> WEB
    VF -- "iframe 임베드" --> WEB
```

---

## 3. 컴포넌트 명세

### 3.1 정적 웹 (HTML 10개 + JS 모듈)

| 화면 | 주요 JS 모듈 | 역할 |
|---|---|---|
| `index.html` | `landing.js` | 홈 — KPI 스트립(Supabase 모드), 운임지수 스트립, 히어로 캔버스, 한/영/중 다국어(`i18n.js`) |
| `insight.html` | `data.js` · `insight.js` | Port Insight — PCI 게이지·분포·권역·Leaflet 지도·순위, 포트 검색 |
| `berth.html` | `data_berth.js` · `berth.js` · `weather.js` | 선석배정 — 16터미널 고급 그리드(필터·검색·마감임박 강조), 항만 기상 카드, 우클릭 Excel 내보내기 |
| `vessel.html` | `vessel.js` | 선박 위치 — VesselFinder AIS 지도 임베드 |
| `cargo.html` | `cargo.js` | 화물 추적 — UNIPASS 조회(Edge Function `track` / 로컬 `server.py` 프록시) + 딥링크 |
| `route.html` | `route.js` | 경로 분석 — 몬테카를로 소요일 분포, CARTO Voyager 지도 항로 시각화(사전계산 `routes/` 93개 JSON) |
| `schedule.html` | — | 해외 스케줄 — 준비중(기획 화면, FR-04/05) |
| `status.html` | `status.js` | 데이터 현황(관리자 전용) — 판정 배너·흐름도·신선도 게이지·7일 적재 타임라인 |
| `login.html` | `auth.js` | 로그인·회원가입·비밀번호 찾기(이메일 인증코드, 비밀번호 강도 미터) |
| `admin.html` | `auth.js` | 관리자 — 가입 승인/거부, 비밀번호 재설정 |

공통 모듈: `common.js`(로고·라이트/다크 테마·헤더), `i18n.js`(다국어, localStorage `twl-lang`), `auth-gate.js`(미로그인 시 일정시간 후 blur + 로그인 유도 — UX 억제 수준, 완전한 보안 아님).

### 3.2 배치 수집기 (`scripts/`)

| 스크립트 | 역할 | 대상 테이블 |
|---|---|---|
| `collect_upload_berth.py` | 선석배정 통합 엑셀 파싱 → 일일 적재. 시트별 컬럼 매핑(MAP)으로 이질 스키마 정규화 | `bs_vessel_calls` · `bs_collect_log` |
| `collect_portinsight_api.py` | IMF PortWatch(ArcGIS FeatureServer) → PCI 지수 산출(활동량 0.60 + 물동량 0.25 + 모멘텀 0.15). 부산·광양·인천은 `bs_vessel_calls` 실측으로 보정 | `pi_ports`(93) · `pi_snapshot` |
| `collect_freight_index.py` | SCFI/CCFI 수집(상하이해운거래소 JSON, Referer 필요·CORS 불가로 배치 경유). KCCI는 미지원 | `freight_index` |
| `backfill_upload_berth.py` | 과거분 일괄 백필 — 헤더 변형 VARIANTS 자동 대응, `--dry-run` 검증 | `bs_vessel_calls` |

보조: `upload_berth_sql_parts.py`(일일 적재용 분할 SQL 생성 — 스케줄러 ②가 사용). 모든 수집기는 `--sql` 모드로 SQL 파일만 생성하고, 실제 DB 쓰기는 스케줄러의 Claude 세션이 Supabase MCP로 실행한다. 적재는 동일 수집일 delete 후 insert(멱등).

### 3.3 Edge Functions (`supabase/functions/`)

| 함수 | 역할 | 시크릿 |
|---|---|---|
| `send-code` | 가입·비밀번호 재설정 인증코드 이메일 발송 (denomailer + 본인 SMTP, 네이버 `smtp.naver.com:465`) | `SMTP_HOST/PORT/USER/PASS/FROM` |
| `track` | 관세청 UNIPASS 화물통관진행정보 프록시 (정적 사이트에서 직접 호출, `verify_jwt=false`). 키 미등록 시 `needKey` 안내 반환 | `UNIPASS_API_KEY` |

### 3.4 인증 서브시스템

- **방식**: Supabase 커스텀 인증(Supabase Auth 미사용) — 이메일+비밀번호(bcrypt), 이메일 인증코드(OTP) 가입, 관리자 승인, 30일 세션 토큰.
- **가입 흐름**: 인증코드 발송(`send-code`) → 코드 검증 후 가입 신청(pending) → 관리자 승인(`admin.html`) → 로그인.
- **DB 함수**(`supabase/auth_setup.sql`, 전부 SECURITY DEFINER·anon 실행 권한): `app_login` · `app_me` · `app_logout` · `app_signup_verified` · `app_reset_with_code` · `app_admin_list` · `app_admin_set_status` · `app_admin_reset_pw`.
- 인증 테이블 3종은 RLS만 활성화하고 정책이 없어 anon이 직접 접근할 수 없다 — 위 함수를 통해서만 접근.

### 3.5 로컬 백엔드 (배포 대상 아님)

`server.py`(포트 8090) — UNIPASS·searoute·data.go.kr 프록시. **로컬 전용**이며 GitHub Pages/Netlify 배포판에서는 동작하지 않는다(해당 화면은 미연결 안내 표시).

---

## 4. 데이터 모델

핵심 컬럼만 표기. 근거: `sql/setup_supabase.sql`(pi_*), `sql/setup_supabase_berth.sql`(bs_*), `supabase/auth_setup.sql`(인증 3종). `freight_index`는 셋업 SQL 없이 운영 중이며 컬럼은 `sql/upload_freight.sql` upsert 문 기준.

```mermaid
erDiagram
    bs_terminals ||--o{ bs_vessel_calls : "terminal_cd FK"
    app_users ||--o{ app_sessions : "user_id FK"

    bs_terminals {
        text code PK
        text name_ko
        text port_ko
        int region_ord
        text website
    }
    bs_vessel_calls {
        bigint id PK
        date collected_date
        text terminal_cd FK
        text berth
        text carrier
        text vessel_name
        text voyage
        text route
        timestamptz eta
        timestamptz etd
        int discharge_qty
        int load_qty
        int shift_qty
        text status
        jsonb raw
    }
    bs_collect_log {
        bigint id PK
        date collected_date
        text file_name
        int total_rows
        jsonb per_terminal
        text status
        text message
    }
    pi_ports {
        bigint id PK
        text name_en
        text name_ko
        text country_cd
        text region_cd
        numeric lat
        numeric lng
        numeric tpfs "PCI 0~100"
        numeric delay_h
        int waiting_cnt
        int berthed_cnt
    }
    pi_snapshot {
        int id PK "단일행 id=1"
        int total_ports
        numeric tpfs
        int critical_ports
        text global_risk
        numeric avg_delay_h
        jsonb distribution
        date period_start
        date period_end
    }
    freight_index {
        text index_code "SCFI·CCFI"
        text route
        numeric value
        numeric prev_value
        numeric pct_change
        date pub_date "unique(code,route,date)"
    }
    app_users {
        uuid id PK
        text login_id UK
        text pass_hash "bcrypt"
        text status "pending·approved·rejected"
        text role "user·admin"
        text display_name
    }
    app_sessions {
        uuid token PK
        uuid user_id FK
        timestamptz expires_at "30일"
    }
    email_codes {
        uuid id PK
        text login_id "app_users와 논리적 연결(FK 없음)"
        text code
        text purpose "signup·reset"
        timestamptz expires_at "10분"
        boolean consumed
    }
```

- `bs_vessel_calls` 인덱스: `(collected_date desc)`, `(terminal_cd, collected_date desc)`. 적재는 동일 `collected_date` delete 후 insert.
- `bs_terminals`는 운영 기준 16행(셋업 SQL의 초기 시드는 9행, 2026-07-29 FR-02로 16개 확대 적재).
- `pi_ports`는 Focus 포트 93행, `pi_snapshot`은 id=1 단일행. 컬럼명 `tpfs`는 구용어(TW-PFS) 유지분으로, 화면 표기는 PCI로 표준화됨.

---

## 5. 배포 토폴로지

```mermaid
flowchart LR
    DEV["개발 PC<br/>git push origin master"] --> GHA["GitHub Actions<br/>deploy-pages.yml"]
    GHA -- "_site 선별 수집<br/>(*.html·sitemap·robots·css/js/assets/routes)" --> GHP["GitHub Pages (주경로)<br/>sitditrd.github.io/AI_SCM"]
    GHA -- "배포 후 curl POST<br/>NETLIFY_BUILD_HOOK 시크릿" --> NET["Netlify (미러)<br/>netlify.toml 동일 선별 빌드"]
```

- **주경로 — GitHub Pages**: `master` push 시 `deploy-pages.yml`이 `_site/`에 웹 파일만 선별 복사(`*.html`, `sitemap.xml`, `robots.txt`, `css/ js/ assets/ routes/`) 후 배포. 사업문서(`docs/`)·수집기(`scripts/`)·SQL 덤프는 게시 제외. 저장소가 private이 되면 무료 계정 Pages가 꺼지므로 public 유지 필요.
- **미러 — Netlify**: 배포 잡 마지막에 `NETLIFY_BUILD_HOOK`(GitHub Secrets)로 빌드 훅 POST(미설정 시 조용히 건너뜀). `netlify.toml`도 동일한 `_site` 선별 복사를 수행해 두 배포본의 게시 범위를 일치시킨다.
- **캐시 전략**: HTML은 캐시버스팅이 없으므로 항상 재검증(`Cache-Control: max-age=0, must-revalidate` — Netlify 헤더), css/js는 `?v=` 쿼리 버스팅 사용, `/assets/*`는 7일 캐시(`max-age=604800`). 공통 보안 헤더: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`.

---

## 6. 보안 모델

| 항목 | 내용 |
|---|---|
| 클라이언트 키 | **publishable key만 노출**. 전 데이터 테이블 RLS 활성화, 익명은 select 정책만(`pi_*`·`bs_*`·`freight_index`) — 쓰기 불가 |
| 인증 테이블 | `app_users`·`app_sessions`·`email_codes`는 RLS 활성화 + **정책 없음** → anon 직접 접근 차단. 접근은 **SECURITY DEFINER 함수 8종**(anon execute grant)으로만 |
| 비밀번호 | bcrypt 해시(`crypt` + `gen_salt('bf')`, pgcrypto). 평문 미저장 |
| service_role 키 | **PC에 보관하지 않음** — 수집기는 `--sql` 모드로 SQL 파일만 생성하고, DB 쓰기는 스케줄러 세션이 Supabase MCP로 실행. 직접 REST 쓰기 시에만 환경변수 `SUPABASE_SERVICE_KEY` 사용(저장소 커밋 금지) |
| 시크릿 위치 | GitHub Secrets: `NETLIFY_BUILD_HOOK` · Supabase Edge Functions Secrets: `SMTP_HOST/PORT/USER/PASS/FROM`, `UNIPASS_API_KEY` |
| 화면 게이트 | 미로그인 blur 게이트(`auth-gate.js`)는 정적 사이트 특성상 UX 억제 수준 — 데이터 자체는 RLS select-only로 보호 |

---

## 7. 기술 스택 요약

| 구분 | 기술 |
|---|---|
| 프런트엔드 | 순수 HTML/CSS/JS(빌드 없음), Leaflet + CARTO 타일, SheetJS(지연 로드, Excel 내보내기), 라이트/다크 CSS 토큰 |
| 데이터베이스 | Supabase PostgreSQL (프로젝트 `kvmyiualdodcvreoqfin`), RLS, SECURITY DEFINER 함수, pgcrypto |
| 서버리스 | Supabase Edge Functions (Deno) — `send-code`(denomailer), `track`(UNIPASS 프록시) |
| 배치 | Python (openpyxl, requests) — `--sql` 생성 + Supabase MCP 적재 |
| 스케줄러 | Cowork 앱 ①(06:00 수집) + Claude 앱 예약 작업 ②③④(08:03 선석·08:44 PCI·월금 17:02 운임지수). 윈도우 작업 스케줄러 미사용 |
| CI/CD | GitHub Actions (`deploy-pages.yml`) → GitHub Pages(주) + Netlify 빌드 훅(미러) |
| 외부 연동 | IMF PortWatch(ArcGIS REST), 상하이해운거래소(SCFI/CCFI), Open-Meteo Marine(브라우저 직접), VesselFinder AIS(iframe), 관세청 UNIPASS |
