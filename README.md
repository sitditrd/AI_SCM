# TWL Control Tower — 태웅로직스 물류 관제 포털

> **이 파일 하나로 다른 PC에서 작업을 이어받을 수 있습니다.** (마스터 인수인계 · 최종 갱신 2026-07-28)
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

## 2. 현재 상태 (2026-07-28)

| 영역 | 상태 |
|---|---|
| 웹(정적) 8화면 | ✅ 운영 · GitHub Pages 무료 배포 (index·insight·berth·vessel·cargo·route·schedule·status) |
| 데이터(Supabase) | ✅ 선석배정 14일 이력·PCI 지수·운임지수 적재 중 |
| 자동 수집 | ⏳ **다른 PC에서 스케줄러 운영** (git pull로 연계) |
| React 이관(app/) | 🔨 기반 + 선석배정 + 데이터현황 완료(공통 그리드 재사용), 4화면 남음 |
| 배포 | ✅ GitHub Pages (Netlify는 무료 크레딧 소진으로 보류) |

**화면별**: Port Insight(PCI 혼잡지수·포트검색), 선석배정(고급 그리드), 선박위치(AIS), 화물추적(UNIPASS+딥링크), 경로분석(몬테카를로), 해외 스케줄(준비중 기획), 데이터현황(운영보드). 상단 **국내/해외 탭**으로 범위 전환.

---

## 3. 폴더 구조

```
AI_SCM/
├─ README.md              ← 본 문서 (마스터 인수인계)
├─ *.html ×8              웹 화면 (웹 루트)
├─ css/style.css          공통 스타일 (라이트/다크 토큰)
├─ js/*.js ×11            데이터 레이어·렌더러·공통 스크립트
├─ assets/                twl_symbol.png · twl_logo.ico · og-image.png
├─ routes/ ×93            사전계산 항로(경로 분석용 정적 JSON)
├─ sitemap.xml, robots.txt
├─ server.py              로컬 백엔드(8090) — UNIPASS·searoute·data.go.kr 프록시(로컬 전용)
├─ scripts/               ★수집기(다른 PC 실행) — 아래 표
├─ sql/                   Supabase 셋업·적재 SQL
├─ app/                   React+TS 이관 진행분(Vite)
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

## 5. React 앱 (app/) 이어가기

```bash
cd app
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드(dist/)
```

- **완료**: 디자인 토큰·공용 레이아웃·Supabase 데이터 레이어·**재사용 DataGrid**(정렬·컬럼 DnD·그룹핑 트리·엑셀·툴팁)·선석배정·데이터현황
- **남음**: insight·vessel·cargo·route 4화면 (현재 레거시 화면 연결 자리표시자) → 이관 후 Pages를 React 빌드로 컷오버
- 스택(전부 무료 MIT): TanStack Table · dnd-kit · exceljs · react-router-dom

---

## 6. 남은 작업 리스트

### A. 지금 바로 가능
1. React 나머지 4화면 포팅 (insight·vessel·cargo·route) → 이후 Pages 빌드 컷오버
2. 모바일/반응형 QA · 번들 최적화(코드 스플릿) · 접근성 심화 감사

### B. 자원·결정 필요 (막힘 — 확보 시 즉시 동작)
3. **FR-02** 터미널 8곳 확대 — 조회 URL·스케줄 수집(다른 PC 담당)
4. **FR-04/05** 해외 스케줄 실데이터 — 데이터 소스 확정(스크래핑/OCR/공개API)
5. **화물 추적 실조회** — `UNIPASS_API_KEY`
6. **해수부/공항 본선·화물편** — `DATA_GO_KR_KEY`
7. **선사 무료 API(HMM DCSA 등)** — 개발자 등록·무료 키 (조사 완료)
8. **AIS 레이어/내륙 최적화** — AISStream·ORS 키
9. **Windows 예비 스케줄러** — `SUPABASE_SERVICE_KEY`

### C. 운영·고도화 (선택)
10. 스케줄 자동화 점검(다른 PC 운영분) · M2 터미널 매핑·ICON 중복정리 · v3 지표(UNCTAD·CPPI) · KCCI 파서

> 요구사항 명세서(FR-01~05)는 `PRJ_2026/피드백리스트/항만인텔리전스_요구사항명세서_20260728.md` 참조. **FR-01·FR-03 완료**, FR-04/05는 기획 화면(준비중) 배치됨.

---

## 7. 이 프로젝트에서 개발된 것 (주요 이력)

| 구분 | 내용 |
|---|---|
| 기반 | 선석배정 파이프라인·Port Insight(PortWatch→PCI)·오픈데이터(AIS·운임·기상)·운영보드·경로 분석(몬테카를로)·화물 추적(UNIPASS 프록시) |
| 용어 | TW-PFS → **PCI(Port Congestion Index)** 전면 표준화 (DB 컬럼 `tpfs`는 유지) |
| 디자인 | 라이트/다크 테마 전면 수리·Stat Deck·브랜딩(TWL Control Tower) |
| 데이터 | 선석배정 14일 백필(3,218건, 헤더 변형 자동대응) |
| UX | 선석배정 고급 그리드(페이지네이션·연속스크롤·컬럼필터·트리·우클릭 퀵뷰), FR-01 포트 검색, 소요일 분포 SVG 차트 |
| 구조 | 폴더 계층화(css/js/assets), 국내/해외 탭, 해외 스케줄 허브(준비중) |
| 배포 | GitHub Pages 무료 자동배포, OG/SEO/a11y 폴리시 |
| React | app/ 기반 + 선석배정 + 데이터현황 이관 |
| 부가 산출물 | 위험물 물류 통합 플랫폼 발표 PPT·Connect DG 통합본·화물 무료 API 조사(59건) |

---

## 8. 문서 인덱스 (PRJ_2026/)

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

## 9. 트러블슈팅 요점

- **사이트가 전부 404** → 저장소가 private으로 바뀌어 Pages가 꺼진 것. public 전환 + Pages 재활성화(§4)
- **탭 제목/내용 안 바뀜** → 브라우저 캐시. `Ctrl+F5`. (HTML은 캐시버스팅 없음)
- **Netlify 배포 멈춤** → 무료 빌드 크레딧 소진("deploys paused"). 결제 주기 리셋 대기 or GitHub Pages 사용(현재 채택)
- **수집 데이터 미반영** → 스케줄러 PC에서 수집기 실행/로그 확인, 같은 Supabase 프로젝트인지 확인

---

*TWL Control Tower · 태웅로직스 · itt@twsc.co.kr · 본 문서는 다른 PC 이어받기용 단일 진입점입니다.*
