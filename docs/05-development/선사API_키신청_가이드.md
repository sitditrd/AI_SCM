# B등급 선사 API 키 신청 가이드 (담당자용)

작성 2026-08-12 · 근거: [선사확장_로드맵_물동량기준.md](선사확장_로드맵_물동량기준.md)

키 4개가 나오면 개발(어댑터 2개)로 화물추적 커버리지가 **14.95% → 44.5%** 가 된다.
신청은 전부 **무료**이고, 공통 준비물은 **사업자등록증(영문 상호 포함)** 과 회사 이메일이다.

## 신청 목록 (물동량 순)

### 1. 머스크 — 자사 물동량 1위 (8.04%)

- 포털: <https://developer.maersk.com>
- 절차: 계정 생성 → `Consumer Key` 발급 → **Track & Trace (DCSA)** API 구독 신청
- 필요 정보: 회사명(영문), 사업자번호, 담당자 이메일
- 승인: 보통 수일 내. 승인 메일에 키가 아니라 포털 내 앱 화면에 키가 생긴다
- 무료 한도: 분당 호출 제한 있음(포털 명시) — 우리 폴링 규모(수백 건/일)에는 충분

### 2. HMM (6.31%)

- 포털: <https://apiportal.hmm21.com>
- 절차: 회원가입(사업자번호 입력) → API 이용 신청 → **선적 진행 조회(Track & Trace)** 선택
- 국내 선사라 한국어 지원. 승인이 가장 빠를 것으로 예상
- 유일하게 DCSA 가 아닌 자체 규격 — 전용 어댑터 1개 필요(개발 몫)

### 3. CMA CGM (5.16%)

- 포털: <https://developer.cmacgm-group.com>
- 절차: 계정 생성 → 앱 등록 → **Tracking / DCSA T&T** 구독
- CNC Line(자사 코드 LCNCL) 물량도 같은 API 로 조회된다

### 4. 하파그로이드 (3.73%)

- 포털: <https://developer.hapag-lloyd.com>
- 절차: 계정 생성 → **DCSA Track & Trace** 구독 신청
- 자사 LINE_CD 3종(LHAPAG1·LHAPAG·LHAPAGT) 물량이 전부 이 키 하나로 처리된다

### (병행) MSC — 영업 접촉 건 (5.71%)

- 포털 공개 신청이 없다. **MSC Korea 영업 담당자에게 API 사용 요청**을 넣어야 한다
- 요청 문구 예: "MSC API (Track & Trace) 사용을 원합니다. 포워더이며 월 ○○건 조회 예상"
- 키가 나오면 B등급과 동일하게 즉시 반영 가능

## 키가 나오면

키 값을 채팅·메일·문서에 붙여넣지 말 것. **Supabase 대시보드 → Project Settings →
Edge Functions → Secrets** 에 아래 이름으로 직접 등록한다(등록 후 "넣었다"고만 알려주면 됨):

| Secret 이름 | 선사 |
|---|---|
| `MAERSK_API_KEY` | 머스크 |
| `HMM_API_KEY` | HMM |
| `CMACGM_API_KEY` | CMA CGM |
| `HLAG_API_KEY` | 하파그로이드 |
| `MSC_API_KEY` | MSC |

등록 즉시 개발 착수 조건이 갖춰진다 — DCSA 공용 어댑터 1개(머스크·CMA·하파그) + HMM 전용 1개.
전부 나올 때까지 기다릴 필요 없이 **나오는 순서대로 하나씩 반영**한다.
