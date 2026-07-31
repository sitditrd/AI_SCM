# 다른 PC 연계·이어받기 인수인계 가이드

> **목적**: 스케줄 자동화(데이터 수집)를 운영 중인 **다른 PC**가, 이 세션에서 개발된 프런트엔드/배포 변경분을 **git으로 이어받아 하나의 서비스로 연계**하도록 안내.
> 작성 2026-07-28 · 갱신 2026-07-31 · 저장소 https://github.com/sitditrd/AI_SCM · 문의 itt@twsc.co.kr

---

## 1. 핵심 원리 — 왜 그냥 연계되는가

이 시스템은 **수집(백엔드)** 과 **웹(프런트)** 이 **Supabase를 사이에 두고 완전히 분리**되어 있습니다.

```
[다른 PC · 스케줄러]                     [Supabase(공유 DB)]              [웹 · GitHub Pages]
 collect_*.py  ──(쓰기: service key)──▶  bs_vessel_calls / pi_ports  ◀──(읽기: 공개키)── insight/berth/…
 매일 자동 수집                            freight_index 등                 사용자 브라우저가 직접 조회
```

- **다른 PC(스케줄러)** 는 파이썬 수집기로 **Supabase에 쓰기**만 합니다.
- **웹** 은 브라우저에서 **Supabase를 읽기**만 합니다 (공개 publishable key).
- 둘은 서로를 직접 호출하지 않으므로, **다른 PC가 내 최신 코드를 `git pull` 하면 그대로 연계**됩니다. 스케줄러는 계속 같은 Supabase에 쓰고, 웹은 그걸 읽어 표시할 뿐입니다.

> 즉 "히스토리를 심는다" = **다른 PC에서 이 저장소를 clone/pull** 하는 것. 별도 연동 작업 없이 붙습니다.

---

## 2. 다른 PC에서 이어받기 (STEP)

### STEP 1 · 저장소 가져오기

```bash
# 처음이면 clone
git clone https://github.com/sitditrd/AI_SCM.git
cd AI_SCM

# 이미 있으면 최신화 (이 세션 커밋 전부 반영)
git pull origin master
```

이 세션에서 추가된 최신 커밋(예): `경로 분석 차트 개선` → `해외 스케줄 허브` → `FR-03 국내/해외 탭` → `FR-01 포트 검색` → `GitHub Pages 배포` 등.

### STEP 2 · 폴더 구조 숙지 (2026-07-28 계층화됨)

```
AI_SCM/
├─ *.html ×8            7개 화면 + schedule.html(해외 허브)   ← 웹 루트
├─ css/style.css        공통 스타일(라이트/다크 토큰)
├─ js/*.js ×11          데이터 레이어·렌더러·공통
├─ assets/              twl_symbol.png · twl_logo.ico
├─ routes/ ×93          사전계산 항로(경로 분석용 정적 JSON)
├─ scripts/             수집기(★다른 PC가 실행) — 아래 4종
├─ sql/                 셋업·적재 SQL
├─ .github/workflows/   deploy-pages.yml (push→GitHub Pages 자동배포)
└─ docs/            문서(개요·상세기술서·개발이력·개발자가이드·피드백)
```

### STEP 3 · 스케줄러 환경 확인 (다른 PC가 이미 운영 중)

수집기 4종은 그대로 유지 — pull 후에도 인터페이스 변화 없음:

| 스크립트 | 역할 | 실행 |
|---|---|---|
| `scripts/collect_upload_berth.py` | 선석배정 일일 수집→적재 | `python … [YYYYMMDD]` 또는 `--sql` |
| `scripts/collect_portinsight_api.py` | PortWatch→PCI 지수 산출·적재 | `python …` 또는 `--sql` |
| `scripts/collect_freight_index.py` | SCFI/CCFI 운임지수 수집 | `python …` 또는 `--sql` |
| `scripts/backfill_upload_berth.py` | (신규) 과거분 일괄 백필 | `--dry-run` 후 실행 |

> 현행 운영(2026-07-31)은 **스케줄러 4종 체계** — Cowork/Claude 앱 내장 스케줄러가 수집기의 `--sql` 산출물을 Supabase MCP로 적재. 시각·작업 ID·실행 모델은 `docs/06-operations/스케줄러_체계.md` 참조.

⚠️ `--sql` 모드가 생성하는 `sql/upload_berth.sql`·`sql/update_portinsight.sql`·`sql/upload_freight.sql`·`sql/backfill_berth.sql`은 매 실행 시 재생성되는 산출물이므로 **커밋 금지** (.gitignore 등록됨, 2026-07-31).

**환경변수** (다른 PC에 설정):
```bash
SUPABASE_SERVICE_KEY=<service_role 키>   # 직접 적재 시에만 필수 (--sql 모드는 불필요 — 키를 PC에 저장하지 않음)
UNIPASS_API_KEY=<유니패스 키>            # 화물 추적 실조회 (선택)
DATA_GO_KR_KEY=<공공데이터포털 키>       # 해수부/공항 프록시 (선택)
```
필요 패키지: `pip install openpyxl requests`

### STEP 4 · 웹 배포는 자동

다른 PC에서 코드 수정 후 `git push` 하면 **GitHub Actions가 GitHub Pages로 자동 배포**합니다.
- push 인증: **gh CLI 인증 기반** (`gh auth login` 후 push, 2026-07-31 확립). PAT 직접 입력 방식도 가능.
- 배포 URL: **https://sitditrd.github.io/AI_SCM/**
- Netlify 미러: 저장소 Actions 시크릿에 `NETLIFY_BUILD_HOOK` **등록 완료(2026-07-31)** — Pages 배포 후 Netlify 미러 빌드가 자동 트리거됨.
- ⚠️ 저장소를 **private으로 바꾸면 무료 계정은 Pages가 꺼집니다.** public 유지 필수. (자세한 건 `GitHub_Pages_배포가이드.md`)

---

## 3. 이 세션에서 개발된 것 (이어받는 개발자가 알아야 할 변경)

| 변경 | 파일 | 비고 |
|---|---|---|
| **폴더 계층화** | css/·js/·assets/ | 루트 평면 → 계층. 참조 경로 전부 갱신됨 |
| **브랜딩** | 전 페이지 title | "TWL Control Tower — 태웅로직스 물류 관제" |
| **용어 표준화** | 전 페이지 | TW-PFS → **PCI(Port Congestion Index)**. DB 컬럼 `tpfs`는 유지 |
| **FR-01 포트 검색** | insight.html·js/insight.js | 항구명/LOCODE 자동완성→지도 포커스+상세패널 |
| **FR-03 국내/해외 탭** | 전 대시보드 | 상단 스코프탭. 해외→schedule.html |
| **해외 스케줄 허브** | schedule.html | Ship Schedule 3뷰·해외 터미널 (준비중 기획) |
| **소요일 분포 차트** | js/route.js | CSS막대 → SVG(밴드·곡선·마커·툴팁) |
| **GitHub Pages 배포** | .github/workflows/ | push→자동배포 (Netlify 크레딧 소진 대체) |
| **React 이관 착수** | app/ | 기반+선석배정 고급 그리드(TanStack+dnd-kit+exceljs) → 최종 채택 보류, app/ 제거(2026-07-28): 사유는 SEO 후퇴·번들 무게·빌드/인수인계 복잡도 |

---

## 4. 이어받기 체크리스트

- [ ] 다른 PC에서 `git pull origin master` (또는 clone)
- [ ] 스케줄러 환경변수(SERVICE_KEY 등) 유지 확인 → 수집기 정상 실행되는지 1회 수동 실행
- [ ] Supabase 프로젝트 동일(kvmyiualdodcvreoqfin) 확인 — 웹/스케줄러가 같은 DB를 봐야 연계됨
- [ ] `git push` 시 GitHub Actions(Deploy to Pages) 초록 체크 확인 → 사이트 반영 확인
- [ ] 생성 산출물 SQL(`sql/upload_berth.sql` 등 4종)은 **커밋 금지** — .gitignore에 등록됨
- [ ] 저장소 **public 유지** (private 전환 시 Pages 다운)

---

## 5. 남은 과제 (다른 PC에서 데이터 소스 확보 시 착수)

- ~~FR-02 터미널 확대~~ — **완료(2026-07-29)**: 16개 터미널 수집·적재 운영 중 (파서 변형 대응은 2026-07-31 보강)
- **FR-04/05 해외 스케줄 실데이터** — 데이터 소스(스크래핑/OCR/공개API) 확정 후 schedule.html '준비중' 자리에 연결
- **대기 키**: UNIPASS·AISStream·ORS — 키 확보 시 즉시 동작

---

## 6. 관련 문서

- `docs/05-development/CHANGELOG.md` — 전체 타임라인·검증 이력 (이어받기 필독)
- `docs/06-operations/스케줄러_체계.md` — 스케줄러 4종 체계(2026-07-31 기준)·실행 모델·확인 위치
- `docs/05-development/GitHub_Pages_배포가이드.md` — 무료 배포·트러블슈팅
- `docs/05-development/개발자_인수인계_가이드_v1.5.docx` — 키 발급→환경변수→운영 STEP
- `docs/03-architecture/` — 스키마·수집 파이프라인·산식
- `docs/02-requirements/항만인텔리전스_요구사항명세서_20260728.md` — SRS(FR-01~05)

*끝. 문의: itt@twsc.co.kr*
