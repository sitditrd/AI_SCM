# TWL Control Tower — 태웅로직스 물류 관제 포털

> **이 파일 하나로 다른 PC에서 작업을 이어받을 수 있습니다.** (마스터 인수인계 · 최종 갱신 2026-08-03)
> 저장소 https://github.com/sitditrd/AI_SCM · 배포 **https://sitditrd.github.io/AI_SCM/** · 문의 itt@twsc.co.kr

항만 혼잡도·선석배정·선박 위치·화물 추적·경로 분석·해외 스케줄을 한 화면에서 제공하는 사내 물류 대시보드.

---

## 1. 60초 요약 — 다른 PC에서 시작하기

```bash
# 1) 저장소 가져오기 (또는 이미 있으면 git pull)
git clone https://github.com/sitditrd/AI_SCM.git
cd AI_SCM

# 2) 웹은 빌드 불필요 — index.html 을 브라우저로 열면 바로 동작(정적)
#    로컬 백엔드/프록시가 필요하면:  python server.py   → http://localhost:8090

# 3) 코드 수정 후 push 하면 GitHub Pages 로 자동 배포됨
git add -A && git commit -m "..." && git push origin master
```

**핵심 원리** — 수집(스케줄러)과 웹이 **Supabase를 사이에 두고 분리**돼 있어, 다른 PC는 `git pull`만 하면 연계됩니다.

```
[Windows 작업 스케줄러 07:30] run_berth_upload.bat → upload_berth_sql_parts.py --rest  ──(REST 직접 적재)──▶ [Supabase kvmyiualdodcvreoqfin] ◀──(읽기: 공개키)── [웹 · GitHub Pages]
[Claude 앱 예약 작업]         collect_*.py --sql                ──(Claude 세션 · Supabase MCP 적재)──▶ (동일 DB)
```

---

## 2. 현재 상태 (2026-08-03)

| 영역 | 상태 |
|---|---|
| 웹(정적) 8화면 + 로그인/관리자 | ✅ 운영 · GitHub Pages 무료 배포 (index·insight·berth·vessel·cargo·route·schedule·status + login·admin) |
| 데이터(Supabase) | ✅ 선석배정 **16개 터미널** 일일 적재·PCI 지수·운임지수 + **이력 테이블 3종 신규**(`pi_history` PCI 일별 · `weather_history` 파고/풍속 · `vessel_positions` AIS 48h). 스키마 `sql/setup_history.sql` |
| 로그인/승인 | ✅ 커스텀 인증(Supabase, bcrypt) + 관리자 승인 + 미로그인 게이트(지연 blur) + **이메일 인증코드 발송 동작**(네이버 SMTP·denomailer). 관리자 `sitditrd2@naver.com` |
| 자동 수집 | ✅ **스케줄러 7종 운영**(2026-08-03 기준) — ① Cowork 06:00 터미널 16곳 수집 · **② Windows 작업 스케줄러 `TWL_BerthUpload` 07:30 선석 REST 직접 적재(주 경로, 앱 무관)** · ③ Claude 앱 08:03 미적재·부분적재 자동 복구(②의 안전망) · ④ 08:44 PCI 재산출+`pi_history` append · ⑤ 매시 30분 AIS 스냅샷 · ⑥ 6시간마다 기상 이력 · ⑦ 월·금 17:02 운임지수. 상세 `docs/06-operations/스케줄러_체계.md` |
| React 이관(app/) | 채택 보류(app/ 제거) — 운영은 정적본 유지 |
| 배포 | ✅ GitHub Pages(주) + **Netlify 미러 자동 트리거**(`NETLIFY_BUILD_HOOK` 시크릿 등록 완료 2026-07-31, 웹 파일만 선별 게시) |

**화면별**: Port Insight(PCI 혼잡지수·포트검색), 선석배정(16터미널 고급 그리드·항만 기상·**조회결과 우클릭 Excel 내보내기**), 선박위치(AIS·**PORT-MIS 입출항 실적 조회**·**자체 AIS 수신 지도**(Leaflet, 5분 재조회)), 화물추적(UNIPASS+딥링크), 경로분석(몬테카를로·Voyager 지도 항로 시각화), 해외 스케줄(준비중 기획), 데이터현황(운영보드·**관리자 전용**). **국내/해외 탭은 선석배정↔해외스케줄에만** 노출. 미로그인 사용자는 처음엔 정상 노출 → 일정시간 뒤 주요기능 blur + 로그인 유도. **홈페이지는 한/영/중 다국어 전환**(우상단 언어 스위처, `js/i18n.js`).

---

## 3. 폴더 구조

```
AI_SCM/
├─ README.md              ← 본 문서 (마스터 인수인계)
├─ *.html                 웹 화면 8 + login.html · admin.html(로그인/관리자)
├─ css/                   style.css(공통·라이트/다크 토큰) · auth.css(로그인/관리자)
├─ js/*.js                데이터 레이어·렌더러·공통 · auth.js·auth-gate.js(인증)
├─ assets/                twl_symbol.png · twl_logo.ico · og-image.png
├─ routes/ ×93            사전계산 항로(경로 분석용 정적 JSON)
├─ sitemap.xml, robots.txt
├─ server.py              로컬 백엔드(8090) — UNIPASS·searoute·data.go.kr 프록시(로컬 전용)
├─ scripts/               ★수집기(스케줄러 ②~⑦이 실행) — 아래 표
├─ sql/                   Supabase 셋업·적재 SQL · setup_history.sql(이력 테이블 3종)
├─ supabase/              auth_setup.sql · functions/ — Edge Function 3종
│                         send-code(인증코드 발송)·track(유니패스)·datago(data.go.kr 공용 프록시)
├─ .github/workflows/     deploy-pages.yml (push→Pages 자동배포)
└─ docs/                  문서 — 01-overview · 02-requirements · 03-architecture(상세기술서·ARCHITECTURE·API)
                          · 04-design · 05-development(가이드·CHANGELOG) · 06-operations(스케줄러_체계·RUNBOOK) · 07-presentation
```

### 수집기 (scripts/) — 스케줄러가 실행

| 스크립트 | 역할 | 실행 |
|---|---|---|
| `collect_upload_berth.py` | 선석배정 일일 수집→Supabase 적재 | `python … [YYYYMMDD]` / `--sql` |
| `upload_berth_sql_parts.py` | 선석배정 적재 실행기 — `--rest`(REST 직접 적재, SQL 파일 불필요) / `--today`(당일 파일 자동 탐색, 없으면 최근 파일 대체) | `python … --rest --today` |
| `run_berth_upload.bat` | ②의 진입점(Windows 작업 스케줄러 전용). `logs/berth_upload.log` 기록·항상 `exit 0` | 작업 스케줄러 `TWL_BerthUpload` |
| `collect_portinsight_api.py` | IMF PortWatch→PCI 지수 산출·적재 + `pi_history` 일별 append | `python …` / `--sql` |
| `collect_weather_history.py` | Open-Meteo 파고·풍속 이력 수집→`weather_history` | `python …` / `--sql` |
| `collect_ais_positions.py` | AISStream 웹소켓 90초 수신 스냅샷→`vessel_positions` | `python …` / `--sql` |
| `collect_freight_index.py` | KCCI·SCFI/CCFI 해상운임지수 수집 | `python …` / `--sql` |
| `backfill_upload_berth.py` | 과거분 일괄 백필(헤더 변형 자동대응) | `--dry-run` 후 실행 |

> ⚠️ `run_berth_upload.bat` 은 **ASCII 전용 유지 필수**. cmd.exe 가 `.bat` 을 콘솔 코드페이지로 파싱하기 때문에 한글이 섞이면 줄이 깨지고, 작업이 "성공(결과 0)"으로 끝나면서 실제로는 아무 일도 하지 않습니다(2026-08-03 실측 장애).

**자동 실행** (2026-08-03 기준 **7종**): ① Cowork 앱(매일 06:00 터미널 16곳 수집) · **② Windows 작업 스케줄러 `TWL_BerthUpload`(매일 07:30, `run_berth_upload.bat` → `upload_berth_sql_parts.py --rest --today`) — 앱 기동과 무관한 주 경로** · ③ Claude 앱 `berth-upload-supabase`(매일 08:03, 최근 7일 건수 비교로 미적재·부분적재 자동 복구하는 ②의 안전망) · ④ `portinsight-daily-update`(매일 08:44 — ② 이후라 부산·광양·인천 접안/대기 척수를 당일 선석 실측으로 보정) · ⑤ `ais-positions-collect`(매시 30분) · ⑥ `weather-history-collect`(6시간마다) · ⑦ `freight-index-update`(월·금 17:02). ②③ 모두 동일 수집일 replace(멱등)라 중복 실행이 안전합니다 — 시각·작업 ID·확인 위치는 `docs/06-operations/스케줄러_체계.md` 참조.
**환경변수**: `SUPABASE_SERVICE_KEY` **등록 완료(2026-08-03, 사용자 환경변수)** — ② REST 직접 적재 가동을 위해 **②만 예외적으로 PC에 보관**(③④⑤⑥⑦은 종전대로 `--sql` 생성 후 Supabase MCP로 적재) · `AISSTREAM_API_KEY` **등록 완료** → ⑤ 가동 · `UNIPASS_API_KEY`(Edge Function `track`)·`DATA_GO_KR_KEY`(Edge Function `datago`)는 **미등록 대기** — 등록 즉시 코드 수정 없이 동작.
수집 스크립트에는 `env_key()` 가 있어 환경변수가 상속되지 않으면 Windows 사용자 환경변수 레지스트리에서 키를 직접 읽습니다(`setx` 직후 재시작 불필요).
**무인 실행 설정**: Claude 앱 예약 작업이 도구 승인 대기로 멈추지 않도록 `~/.claude/settings.json` 의 `permissions.allow` 에 `PowerShell(python *)`·`Bash(python *)`·`Read`·Supabase `execute_sql` 을, `additionalDirectories` 에 `%TEMP%\berth_sql_parts` 를 등록해 둡니다.
**패키지**: `pip install openpyxl requests`

---

## 4. 배포 (GitHub Pages)

- `git push origin master` → GitHub Actions(`Deploy to Pages`) 자동 실행 → **https://sitditrd.github.io/AI_SCM/**
- ⚠️ **저장소를 private으로 바꾸면 무료 계정은 Pages가 꺼집니다.** 반드시 **public 유지**.
  - 만약 꺼졌다면: Settings → Pages → Source **`GitHub Actions`** 재지정 후 아무 커밋이나 push
- 상세: `docs/05-development/GitHub_Pages_배포가이드.md`

---

## 5. 로그인·승인 시스템 (2026-07-29 신규)

승인된 계정만 로그인 가능하며, 미로그인 사용자는 처음엔 정상 노출 → 일정시간(18초) 뒤 주요기능이 **blur + "로그인 필요"** 오버레이로 가려집니다(lock-in 티저). *(정적 사이트 특성상 화면 게이트는 억제(UX) 수준 — 완벽 보안 아님.)*

- **화면**: `login.html`(로그인/회원가입/비밀번호찾기 + 특수문자·비밀번호 강도 미터), `admin.html`(관리자 승인)
- **백엔드(Supabase)**: 커스텀 인증 — `app_users`(bcrypt 해시)·`app_sessions`·`email_codes` (RLS 잠금 + SECURITY DEFINER 함수). 스키마: `supabase/auth_setup.sql`
- **이메일 발송**: Edge Function `send-code` (오픈소스 denomailer + 본인 SMTP). 소스: `supabase/functions/send-code/index.ts`
- **관리자 계정**: `sitditrd2@naver.com` (최초 비밀번호는 변경 권장 — app_users 실DB 기준 2026-07-31 확인)
- **가입 흐름**: 이메일 인증코드 → 가입신청(pending) → 관리자 승인 → 로그인
- ⚠️ **SMTP 시크릿 등록 필요(무료)**: 네이버/Gmail 본인 메일 SMTP를 대시보드 → Project Settings → Edge Functions → Secrets 에 등록해야 인증코드 메일이 실제 발송됨.
  `SMTP_HOST=smtp.naver.com · SMTP_PORT=465 · SMTP_USER=<메일> · SMTP_PASS=<앱비번> · SMTP_FROM=<메일>`
  등록 전까지도 로그인·관리자 승인은 정상, 인증코드 메일만 미발송(503).

---

## 6. React 시안 (app/) — 채택 보류

React+TS(Vite) 이관 시안은 검토 결과 **채택 보류**하고 `app/` 폴더를 저장소에서 제거했습니다(git 이력엔 보존). 운영본은 **바닐라 정적 사이트(HTML/JS)**로 유지 — 빌드 불필요, `git pull` 후 그대로 서빙합니다.

- **사유**(공개 물류 포털 특성): HashRouter 구조라 검색 색인이 한 페이지로 뭉쳐 SEO 후퇴 · 번들 무게 증가로 초기 로딩 저하 · 빌드 도입으로 배포·타 PC 인수인계 복잡도 상승 · 정적본 대비 사용자 체감 이점 없음

---

## 7. 남은 작업 리스트

### A. 지금 바로 가능
1. ~~Netlify 미러 배포 활성화~~ — **완료(2026-07-31)**: `NETLIFY_BUILD_HOOK` 시크릿 등록, push 시 Pages 배포 후 Netlify 미러 자동 트리거 검증됨("Netlify 빌드 트리거됨" 로그 확인)
2. **라이트 테마 상단 폴리시** — hero 밴드를 라이트에서 밝게 적응(현재 라이트에서도 상단이 짙은 네이비, 진행 예정)
3. 모바일/반응형 QA · 접근성(a11y) 심화 감사 · 이미지/폰트 로딩 최적화

> **이메일 인증코드 발송 완료** — 네이버 SMTP(`sitditrd2@naver.com`) + denomailer Edge Function으로 가입 인증·비번찾기 메일 실동작 확인(2026-07-29). 재설정 필요 시 Supabase → Edge Functions → Secrets 의 `SMTP_*` 값 참조(§5).

### B. 자원·결정 필요 (막힘 — 확보 시 즉시 동작)
4. **FR-04/05** 해외 스케줄 실데이터 — 데이터 소스 확정(스크래핑/OCR/공개API)
5. **화물 추적 실조회** — `UNIPASS_API_KEY` (Edge Function `track` 배포 완료 · 키 등록만 남음)
6. **해수부/공항 본선·화물편** — `DATA_GO_KR_KEY` (Edge Function `datago` 배포 완료 — 별칭 화이트리스트 `portmis`·`aircargo`, 키 미등록 시 `needKey` 안내 · 키 등록만 남음)
7. **선사 무료 API(HMM DCSA 등)** — 개발자 등록·무료 키 (조사 완료)
8. ~~AIS 레이어 키~~ — **완료(2026-08-03)**: `AISSTREAM_API_KEY` 등록 → 스케줄러 ⑤ 가동·`vessel_positions` 적재·선박위치 자체 지도 표출. 내륙 최적화(ORS 키)는 미확보
9. ~~Windows 예비 스케줄러~~ — **완료(2026-08-03)**: `SUPABASE_SERVICE_KEY` 등록 + 작업 스케줄러 `TWL_BerthUpload`(07:30)로 승격 — 예비가 아닌 **주 경로**

### C. 운영·고도화 (선택)
10. 스케줄 자동화 점검(스케줄러 7종 운영분, §3) · ICON 중복정리 · v3 지표(UNCTAD·CPPI) · KCCI 파서
11. **06시 수집 지침 보완** — PNCT 원본 엑셀 컬럼이 3개뿐이라 대부분 필드 미해결 · DDCT 열밀림(2026-08-03 4건 수집) · KITL 2026-08-03 헤더 변형 경고(터미널 공표 양식 변경 가능성, 추적 중)

> **FR-02(터미널 확대) 완료** — 선석배정 16개 터미널 적재·조회 반영(2026-07-29).

> 요구사항 명세서(FR-01~05)는 `docs/02-requirements/항만인텔리전스_요구사항명세서_20260728.md` 참조. **FR-01·FR-03 완료**, FR-04/05는 기획 화면(준비중) 배치됨.

---

## 8. 이 프로젝트에서 개발된 것 (주요 이력)

| 구분 | 내용 |
|---|---|
| 기반 | 선석배정 파이프라인·Port Insight(PortWatch→PCI)·오픈데이터(AIS·운임·기상)·운영보드·경로 분석(몬테카를로)·화물 추적(UNIPASS 프록시) |
| 용어 | TW-PFS → **PCI(Port Congestion Index)** 전면 표준화 (DB 컬럼 `tpfs`는 유지) |
| 디자인 | 라이트/다크 테마 전면 수리·Stat Deck·브랜딩(TWL Control Tower) |
| 데이터 | 선석배정 14일 백필(3,218건) + **16개 터미널 확대 적재**(헤더 변형 자동대응·물량 분리·2자리연도·푸터 제거) |
| UX | 선석배정 고급 그리드(페이지네이션·연속스크롤·컬럼필터·트리·우클릭 퀵뷰), FR-01 포트 검색, 소요일 분포 SVG 차트 |
| 구조 | 폴더 계층화(css/js/assets), 국내/해외 탭, 해외 스케줄 허브(준비중) |
| 배포 | GitHub Pages 무료 자동배포, OG/SEO/a11y 폴리시 |
| 인증(2026-07-29) | **로그인/회원가입/관리자 승인 + 미로그인 게이트(지연 blur)** · Supabase 커스텀 인증(bcrypt·RLS·세션) · 이메일 인증코드(오픈소스 denomailer Edge Function·네이버 SMTP 실동작) · 비밀번호 강도 미터(특수문자 체크) |
| 다국어(2026-07-29) | 홈페이지 **한/영/중 3개국어** 전환(우상단 스위처·`js/i18n.js`, localStorage `twl-lang`) |
| 지도(2026-07-29) | 경로 분석 **항로 시각화 고도화** — CARTO Voyager 타일 + 3중 레이어 항로(글로우·본선·흐름 애니메이션)·출발/도착 마커·거리 라벨 |
| 배포 훅(2026-07-29) | GitHub Pages 배포 후 **Netlify 미러 빌드 자동 트리거**(선택·`NETLIFY_BUILD_HOOK` 시크릿) |
| 편의(2026-07-29) | 선석배정 **조회결과 우클릭→Excel(.xlsx) 내보내기**(현재 필터/검색 반영·SheetJS 지연로드·CSV 폴백) · **데이터 현황 관리자 전용**(미관리자 메뉴 숨김+접근 차단) |
| 네비 정리(2026-07-29) | insight·berth에 남아 있던 **'BPO 모듈' 잔여 탭 제거** → 전 페이지 네비게이션 통일(헤더/푸터) |
| 스케줄러(2026-07-31) | **적재 자동화 ②③④ Claude 앱 예약 작업 신규 등록** — 선석 적재(매일 08:03)·PCI 재산출(매일 08:44, ② 이후로 순서 조정해 당일 실측 보정)·운임지수(월·금 17:02). service key 미보관(`--sql` 생성 후 Supabase MCP 적재)·동일 수집일 replace 멱등. 파서 헤더 변형 대응 보강. 상세 `docs/06-operations/스케줄러_체계.md` |
| 정시 적재 이중화(2026-08-03) | **스케줄러 7종 체계 확립** — Windows 작업 스케줄러 `TWL_BerthUpload`(07:30) 신설로 앱 기동과 무관한 **주 경로** 확보, 기존 Claude 앱 08:03은 최근 7일 건수 비교 **자동 복구(안전망)** 로 역할 전환. `upload_berth_sql_parts.py --rest`(REST 직접 적재)·`--today`(당일 파일 자동 탐색) 모드 및 `run_berth_upload.bat` 신규. `SUPABASE_SERVICE_KEY`·`AISSTREAM_API_KEY` 환경변수 등록, `env_key()`(사용자 환경변수 레지스트리 직접 조회)로 `setx` 직후 재시작 불필요 |
| 이력·AIS(2026-08-03) | 신규 테이블 3종(RLS+익명 select) — `pi_history`(일별 PCI, unique(snap_date,name_en)) · `weather_history`(파고·주기·풍속·돌풍) · `vessel_positions`(AIS, 48h 보존). 스케줄러 ⑤ AIS 매시 30분 · ⑥ 기상 6시간마다 신설. `vessel.html/js` 에 **PORT-MIS 입출항 실적 조회** + **자체 AIS 수신 지도**(Leaflet, 5분 재조회) 추가. 스키마 `sql/setup_history.sql` |
| 운영보드 신뢰성(2026-08-03) | 신규 RPC `berth_daily_counts(days int default 7)`(stable·security invoker, anon/authenticated 실행 허용 — PostgREST 집계 비활성 대응) 도입 후 `js/status.js` 최근 7일 타임라인을 `bs_collect_log` 기준 → **실적 건수 기준**으로 전환(실적 있으면 ✓건수, 실적 없이 실패 로그만 있으면 ✗). 로그 누락·건수 불일치에 좌우되지 않음 |
| Edge Function(2026-08-03) | `datago` 신규 — data.go.kr 공용 프록시(별칭 화이트리스트 `portmis`·`aircargo`, `DATA_GO_KR_KEY` 미등록 시 `needKey` 안내). 기존 `track`(유니패스)·`send-code`(인증코드)와 합쳐 **Edge Function 3종** |
| React | app/ 기반 + 선석배정 + 데이터현황 이관 → 최종 채택 보류, app/ 제거(2026-07-28): 사유는 SEO 후퇴·번들 무게·빌드/인수인계 복잡도 |
| 부가 산출물 | 위험물 물류 통합 플랫폼 발표 PPT·Connect DG 통합본·화물 무료 API 조사(59건) |

---

## 9. 문서 인덱스 (docs/)

| 문서 | 용도 |
|---|---|
| `개발이력/개발이력_전체정리.md` | 전체 타임라인·검증 이력 (이어받기 필독) |
| `개발자가이드/다른PC_작업절차_STEP.md` | **다른 PC 작업 순차 절차**(clone→수정→push→배포) |
| `개발자가이드/다른PC_연계_이어받기_가이드.md` | 다른 PC 연계 원리·상세 |
| `개발자가이드/스케줄러_체계.md` | **스케줄러 7종 체계**(시각·작업 ID·실행 모델·확인 위치, 2026-08-03 기준) |
| `개발자가이드/GitHub_Pages_배포가이드.md` | 무료 배포·트러블슈팅 |
| `개발자가이드/개발자_인수인계_가이드_v1.5.docx` | 키 발급→환경변수→운영 STEP |
| `개발자가이드/화물추적_무료API_조사결과.md` | 화물 추적 API 59건 조사 |
| `상세기술서/상세기술서_TWL물류포털.md` | 스키마·수집 파이프라인·산식 |
| `프로젝트개요/PROJECT_OVERVIEW.md` | 프로젝트 개요·진행 경과 |
| `피드백리스트/항만인텔리전스_요구사항명세서_20260728.md` | SRS(FR-01~05) |
| `PRD/`, `화면기획/`, `개발계획서/` | 요구사항·화면·계획 |

---

## 10. 트러블슈팅 요점

- **사이트가 전부 404** → 저장소가 private으로 바뀌어 Pages가 꺼진 것. public 전환 + Pages 재활성화(§4)
- **탭 제목/내용 안 바뀜** → 브라우저 캐시. `Ctrl+F5`. (HTML은 캐시버스팅 없음)
- **Netlify 배포 멈춤** → 무료 빌드 크레딧 소진("deploys paused"). 결제 주기 리셋 대기 or GitHub Pages 사용(현재 채택)
- **수집 데이터 미반영** → ① Windows 작업 스케줄러 `TWL_BerthUpload`(07:30) 실행 결과와 `logs/berth_upload.log` 확인 → ② Cowork/Claude 앱 예약 작업 실행 이력 확인(앱이 켜져 있어야 실행됨, `스케줄러_체계.md`) → ③ `berth_daily_counts` / `bs_collect_log` 조회, 같은 Supabase 프로젝트인지 확인
- **작업 스케줄러가 "성공(결과 0)"인데 적재가 안 됨** → `run_berth_upload.bat` 에 한글이 섞였는지 확인. cmd.exe 가 콘솔 코드페이지로 파싱해 줄이 깨지면 아무 일도 하지 않고 종료됨 — **ASCII 전용 유지**(2026-08-03 실측 장애)
- **화면엔 '없음'인데 데이터는 있음** → 적재는 됐으나 `bs_collect_log` 기록만 누락된 경우. 데이터현황 타임라인은 2026-08-03부터 **실적 건수 기준**(`berth_daily_counts`)이라 정상 표기되며, 로그는 별도 보정

---

*TWL Control Tower · 태웅로직스 · itt@twsc.co.kr · 본 문서는 다른 PC 이어받기용 단일 진입점입니다.*
