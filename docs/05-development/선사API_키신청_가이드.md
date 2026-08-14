# B등급 선사 API 키 신청 가이드 (담당자용)

작성 2026-08-12 · 근거: [선사확장_로드맵_물동량기준.md](선사확장_로드맵_물동량기준.md)

키 4개가 나오면 개발(어댑터 2개)로 화물추적 커버리지가 **14.95% → 44.5%** 가 된다.
신청은 전부 **무료**이고, 공통 준비물은 **사업자등록증(영문 상호 포함)** 과 회사 이메일이다.

## 신청 목록 (물동량 순)

### 1. 머스크 — 자사 물동량 1위 (8.04%)

- 포털: <https://developer.maersk.com>
- 절차: 회사 이메일로 가입 → **My Apps 에서 App 생성(`Consumer-Key` 발급)** → **Ocean Track & Trace** 상품 접근 요청
- **주의(2026-08-12 실사양 확인): 키 하나로 끝나지 않는다.** 프라이빗 T&T API 는
  ① `Consumer-Key` 헤더 + ② OAuth2(client_credentials) Bearer 토큰의 2중 인증이다.
  앱 생성 시 나오는 **Client ID / Client Secret 도 함께** 확보해야 한다
- 승인: **수동 승인 + Maersk Customer Code 필요** — 머스크와 거래 중인 화주/포워더만 승인된다.
  신청서에 태웅의 머스크 고객코드를 기재할 것. 승인 소요일은 공식 미공개(수 영업일)
- 무료 한도: 키당 4,000 콜/시간 + 60 콜/분 — 우리 폴링 규모에 충분

### 2. HMM (6.31%)

- 포털: <https://apiportal.hmm21.com>
- 절차: 회원가입(사업자번호 입력) → API 이용 신청 → **선적 진행 조회(Track & Trace)** 선택
- 국내 선사라 한국어 지원. 승인이 가장 빠를 것으로 예상
- 유일하게 DCSA 가 아닌 자체 규격 — 전용 어댑터 1개 필요(개발 몫)

### 3. CMA CGM (5.16%)

- 포털: <https://api-portal.cma-cgm.com> **(정정 2026-08-12 — developer.cmacgm-group.com 은 현재 응답 없음)**
- 절차: 계정 생성 → 앱 등록 → **Track & Trace (DCSA v2.2)** 구독. 무료 트라이얼 있음
- 퍼블릭 티어는 **API Key 1개(`keyId` 헤더)** 로 끝난다 — 4사 중 가장 간단
- CNC Line(자사 코드 LCNCL) 물량도 같은 API 로 조회된다

### 4. 하파그로이드 (3.73%)

- 포털: <https://api-portal.hlag.com> **(정정 2026-08-12 — developer.hapag-lloyd.com 아님)**
- 절차: 셀프서비스 가입 → 앱 생성 → **Track & Trace** 상품 구독 신청 → 하파그 승인
- 발급물은 **Client ID + Client Secret 한 쌍**(IBM API Connect 방식)
- 자사 LINE_CD 3종(LHAPAG1·LHAPAG·LHAPAGT) 물량이 전부 이 키 하나로 처리된다

### (병행) MSC — 영업 접촉 건 (5.71%)

- 포털 공개 신청이 없다. **MSC Korea 영업 담당자에게 API 사용 요청**을 넣어야 한다
- 요청 문구 예: "MSC API (Track & Trace) 사용을 원합니다. 포워더이며 월 ○○건 조회 예상"
- 키가 나오면 B등급과 동일하게 즉시 반영 가능

## 키가 나오면

키 값을 채팅·메일·문서에 붙여넣지 말 것. **Supabase 대시보드 → Project Settings →
Edge Functions → Secrets** 에 아래 이름으로 직접 등록한다(등록 후 "넣었다"고만 알려주면 됨):

| Secret 이름 | 선사 | 비고 |
|---|---|---|
| `MAERSK_CONSUMER_KEY` | 머스크 | 앱 생성 시 발급되는 Consumer-Key |
| `MAERSK_CLIENT_ID` · `MAERSK_CLIENT_SECRET` | 머스크 | OAuth2 자격 — 프라이빗 T&T 는 이 쌍도 필수 |
| `HMM_API_KEY` | HMM | |
| `CMACGM_API_KEY` | CMA CGM | keyId 헤더로 쓰이는 API Key |
| `HLAG_CLIENT_ID` · `HLAG_CLIENT_SECRET` | 하파그로이드 | IBM API Connect 한 쌍 |
| `MSC_API_KEY` | MSC | |

**어댑터는 구현 완료 상태다(2026-08-12, DCSA 공용 코어 + 머스크·CMA·하파그 3사 — 합성 페이로드 9/9 검증).**
Secrets 에 키를 등록하는 순간 코드 수정·재배포 없이 해당 선사가 실조회로 자동 전환된다
— 등록 전에는 지금처럼 딥링크로 폴백하므로 화면이 깨질 일도 없다.
전부 나올 때까지 기다릴 필요 없이 **나오는 순서대로 하나씩 등록**하면 된다. HMM 만 전용 어댑터 개발이 남아 있다.
