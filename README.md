# TWL Control Tower — 태웅로직스 물류 관제 포털

> **이 파일 하나로 다른 PC에서 작업을 이어받을 수 있습니다.** (마스터 인수인계 · 최종 갱신 2026-07-29)
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
[스케줄러 PC] collect_*.py ──(쓰기: service key)──▶ [Supabase kvmyiualdodcvreoqfin] ◀──(읽기: 공개키)── [웹 · GitHub Pages]
```

---

## 2. 현재 상태 (2026-07-29)

| 영역 | 상태 |
|---|---|
| 웹(정적) 8화면 + 로그인/관리자 | ✅ 운영 · GitHub Pages 무료 배포 (index·insight·berth·vessel·cargo·route·schedule·status + login·admin) |
| 데이터(Supabase) | ✅ 선석배정 **16개 터미널** 일일 적재·PCI 지수·운임지수 |
| 로그인/승인 | ✅ 커스텀 인증(Supabase, bcrypt) + 관리자 승인 + 미로그인 게이트(지연 blur) + **이메일 인증코드 발송 동작**(네이버 SMTP·denomailer). 관리자 `sitditrd2@naver.com` |
| 자동 수집 | ⏳ **다른 PC에서 스케줄러 운영** (git pull로 연계) |
| React 이관(app/) | 채택 보류(app/ 제거) — 운영은 정적본 유지 |
| 배포 | ✅ GitHub Pages (Netlify는 무료 크레딧 소진으로 보류) |

**화면별**: Port Insight(PCI 혼잡지수·포트검색), 선석배정(16터미널 고급 그리드·항만 기상·**조회결과 우클릭 Excel 내보내기**), 선박위치(AIS), 화물추적(UNIPASS+딥링크), 경로분석(몬테카를로·Voyager 지도 항로 시각화), 해외 스케줄(준비중 기획), 데이터현황(운영보드·**관리자 전용**). **국내/해외 탭은 선석배정↔해외스케줄에만** 노출. 미로그인 사용자는 처음엔 정상 노출 → 일정시간 뒤 주요기능 blur + 로그인 유도. **홈페이지는 한/영/중 다국어 전환**(우상단 언어 스위처, `js/i18n.js`).

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
├─ scripts/               ★수집기(다른 PC 실행) — 아래 표
├─ sql/                   Supabase 셋업·적재 SQL
├─ supabase/              auth_setup.sql · functions/send-code(인증코드 발송 Edge Function)
├─ .github/workflows/     deploy-pages.yml (push→Pages 자동배포)
└─ PRJ_2026/              문서 (개요·상세기술서·개발이력·개발자가이드·피드백·PRD·화면기획)
```

### 수집기 (scripts/) — 다른 PC가 실행

| 스크립트 | 역할 | 실행 |
|---|---|---|
| `collect_upload_berth.py` | 선석배정 일일 수집→Supabase 적재 | `python … [YYYYMMDD]` / `--sql` |
| `collect_portinsight_api.py` | IMF PortWatch→PCI 지수 산출·적재 | `python …` / `--sql` |
| `collect_freight_index.py` | SCFI/CCFI 해상운임지수 수집 | `python …` |
| `backfill_upload_berth.py` | 과거분 일괄 백필(헤더 변형 자동대응) | `--dry-run` 후 실행 |

**환경변수** (스케줄러 PC): `SUPABASE_SERVICE_KEY`(필수, 쓰기) · `UNIPASS_API_KEY`(선택) · `DATA_GO_KR_KEY`(선택)
**패키지**: `pip install openpyxl requests`

---

## 4. 배포 (GitHub Pages)

- `git push origin master` → GitHub Actions(`Deploy to Pages`) 자동 실행 → **https://sitditrd.github.io/AI_SCM/**
- ⚠️ **저장소를 private으로 바꾸면 무료 계정은 Pages가 꺼집니다.** 반드시 **public 유지**.
  - 만약 꺼졌다면: Settings → Pages → Source **`GitHub Actions`** 재지정 후 아무 커밋이나 push
- 상세: `PRJ_2026/개발자가이드/GitHub_Pages_배포가이드.md`

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
1. **Netlify 미러 배포 활성화(선택)** — 저장소 Settings → Secrets and variables → Actions 에 `NETLIFY_BUILD_HOOK`(Netlify 빌드 훅 URL) 등록 시 GitHub Pages 배포 후 Netlify도 자동 미러 빌드. 미설정 시 조용히 건너뜀(운영은 GitHub Pages 단독으로 정상)
2. **라이트 테마 상단 폴리시** — hero 밴드를 라이트에서 밝게 적응(현재 라이트에서도 상단이 짙은 네이비, 진행 예정)
3. 모바일/반응형 QA · 접근성(a11y) 심화 감사 · 이미지/폰트 로딩 최적화

> **이메일 인증코드 발송 완료** — 네이버 SMTP(`sitditrd2@naver.com`) + denomailer Edge Function으로 가입 인증·비번찾기 메일 실동작 확인(2026-07-29). 재설정 필요 시 Supabase → Edge Functions → Secrets 의 `SMTP_*` 값 참조(§5).

### B. 자원·결정 필요 (막힘 — 확보 시 즉시 동작)
4. **FR-04/05** 해외 스케줄 실데이터 — 데이터 소스 확정(스크래핑/OCR/공개API)
5. **화물 추적 실조회** — `UNIPASS_API_KEY`
6. **해수부/공항 본선·화물편** — `DATA_GO_KR_KEY`
7. **선사 무료 API(HMM DCSA 등)** — 개발자 등록·무료 키 (조사 완료)
8. **AIS 레이어/내륙 최적화** — AISStream·ORS 키
9. **Windows 예비 스케줄러** — `SUPABASE_SERVICE_KEY`

### C. 운영·고도화 (선택)
10. 스케줄 자동화 점검(다른 PC 운영분) · ICON 중복정리 · v3 지표(UNCTAD·CPPI) · KCCI 파서

> **FR-02(터미널 확대) 완료** — 선석배정 16개 터미널 적재·조회 반영(2026-07-29).

> 요구사항 명세서(FR-01~05)는 `PRJ_2026/피드백리스트/항만인텔리전스_요구사항명세서_20260728.md` 참조. **FR-01·FR-03 완료**, FR-04/05는 기획 화면(준비중) 배치됨.

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
| React | app/ 기반 + 선석배정 + 데이터현황 이관 → 최종 채택 보류, app/ 제거(2026-07-28): 사유는 SEO 후퇴·번들 무게·빌드/인수인계 복잡도 |
| 부가 산출물 | 위험물 물류 통합 플랫폼 발표 PPT·Connect DG 통합본·화물 무료 API 조사(59건) |

---

## 9. 문서 인덱스 (PRJ_2026/)

| 문서 | 용도 |
|---|---|
| `개발이력/개발이력_전체정리.md` | 전체 타임라인·검증 이력 (이어받기 필독) |
| `개발자가이드/다른PC_작업절차_STEP.md` | **다른 PC 작업 순차 절차**(clone→수정→push→배포) |
| `개발자가이드/다른PC_연계_이어받기_가이드.md` | 다른 PC 연계 원리·상세 |
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
- **수집 데이터 미반영** → 스케줄러 PC에서 수집기 실행/로그 확인, 같은 Supabase 프로젝트인지 확인

---

*TWL Control Tower · 태웅로직스 · itt@twsc.co.kr · 본 문서는 다른 PC 이어받기용 단일 진입점입니다.*
