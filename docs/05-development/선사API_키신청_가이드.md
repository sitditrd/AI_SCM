# 선사 트래킹 API 신청 가이드 — 무료 선사만

작성 2026-08-12 · **전면 개정 2026-08-14 (요금 실사 반영)**
근거: [선사확장_로드맵_물동량기준.md](선사확장_로드맵_물동량기준.md) · 요금 실사 13개 에이전트(공식 스펙·약관·카탈로그 API 직접 확인 + 무료 주장 반증 검증)

## 0. 원칙

**비용이 발생하는 선사는 신청하지 않는다**(2026-08-14 사용자 지시). 아래 목록은 요금 실사를 거쳐
**영구 무료로 확인된 선사만** 남긴 것이다. 체험 기간만 무료인 선사는 제외했다.

## 1. 신청 대상 — 무료 확정 5사

전부 붙이면 자사 컨테이너 물동량 커버리지가 **14.95% → 40.18%** 가 된다.

| 순위 | 선사 | 건수 | 비중 | 무료 근거 | 발급 방식 |
|---|---|---|---|---|---|
| 1 | **머스크** | 9,618 | 8.04% | 카탈로그 `monetized:false`·`trialDuration:0` | 셀프 + 수동승인 |
| 2 | **HMM** | 7,550 | 6.31% | 요금·플랜·결제 페이지 자체가 없음 | 셀프 + 승인심사 |
| ~~3~~ | ~~MSC~~ | ~~6,826~~ | ~~5.71%~~ | ~~직접연결은 무과금~~ | **제외 — 계약 서명 필요(2026-08-18 사용자 지시: 계약·유료 전부 제외)** |
| 4 | **하파그로이드** | 4,460 | 3.73% | 카탈로그 `price:"Free"`·약관 §5.1 "free of charge" | **완전 셀프서비스** |
| 5 | **ZIM** | 1,723 | 1.44% | EULA 1.7 "at no cost" | 셀프 + 제품별 승인 |
| | **소계** | **30,177** | **25.23%p** | | |

## 2. 제외 대상 — 유료이거나 API 없음

| 선사 | 건수 | 비중 | 제외 사유 |
|---|---|---|---|
| CMA CGM | 6,167 | 5.16% | **30일 체험만 무료.** 만료 시 접근 비활성. 유료는 월정액+초과단가이고 **400 응답까지 과금 대상** |
| 완하이 | 909 | 0.76% | 공개 API 자체가 없음. 3자 가시성 플랫폼(유료) 외 수단 없음 |
| OOCL | 806 | 0.67% | 계열사 IQAX 유료 구독. 자가가입 불가 |
| **합계** | **7,882** | **6.59%** | 포기하는 물량 |

## 3. 선사별 신청 절차

### ① 하파그로이드 — 가장 먼저 하십시오 (완전 셀프서비스)

돈도 계약도 영업 접촉도 없이 혼자 끝낼 수 있는 유일한 선사다.
아래 경로는 2026-08-14 포털 SPA 라우트·내부 API 를 실측해 확인한 것이다.

- 포털: <https://api-portal.hlag.com> (구 `developer.hapag-lloyd.com` 은 **응답 없음**)
- **라우트 변경 주의(2026-08-19 재실측)**: `/getting-started` · `/products` 는 이제 **404**.
  현재 살아있는 경로는 `/`(랜딩, 200) · `/login`(200) · `/applications`(200).
  가입은 **랜딩 페이지의 Register 버튼**으로 진입한다(딥링크 금지).
  상품 설명·약관은 공식 안내 페이지 <https://www.hapag-lloyd.com/en/online-business/track/track-by-api.html> 참조
  (포털 메타데이터에 price 0.00 EUR 명시 — 무료 유지 확인)

**절차**

| 단계 | 경로 | 내용 |
|---|---|---|
| 1 | `/getting-started` | 안내 확인 후 계정 등록(회사 이메일). reCAPTCHA 적용됨 |
| 2 | `/applications` | **Application 생성 → Client ID + Client Secret 발급** |
| 3 | `/products` | **Track & Trace** 상품에서 위 Application 으로 구독(Subscribe) 신청 |
| 4 | — | 하파그 승인 대기(모든 플랜 `approval:true`) |

- 발급물: **Client ID + Client Secret** 한 쌍 (IBM API Connect 방식 — 헤더 `X-IBM-Client-Id`/`X-IBM-Client-Secret`)
- 상품 페이지 예: `/products/portfolio/events-tracing-for-web-api-product-d73213?version=2` (200 확인)
- 무료 한도(초과 시 **과금이 아니라 429 차단** — 돈이 샐 구조가 아님):
  - Tryout 100콜/일 · Basic **6,000콜/일** · Premium(BETA 중에는 Basic 배정)

**막힐 수 있는 지점** — 포털에 **light user** 개념이 있고, 이 등급은 Application 생성이 차단된다
(앱 번들의 라우트 가드에서 확인). 가입 후 `/applications` 에서 생성 버튼이 없거나 거부되면
등급 문제이므로 `/contact` 로 정식 개발자 계정 승격을 요청해야 한다.

- 주의: BETA 라 하파그 스스로 "웹 데이터를 우선 신뢰하라"고 안내한 이력이 있다. 초기에는 웹 대사 검증 병행 권장

### ② HMM — 국내 선사, 한국어 지원

- 포털: <https://apiportal.hmm21.com>
- 절차: 회원가입(국가·회사명·아이디·이름·이메일·**사용목적**) → API 갤러리에서 **Track and Trace (DCSA) v1** 사용 신청 → 관리자 승인
- 발급물: 액세스 토큰(API 상세 화면에서 확인)
- 결제수단 입력란이 아예 없다. 관문은 돈이 아니라 **승인 심사**다
- 유의: "무료"라고 못 박은 공식 문구는 없고 약관 제17조①에 유료화 유보 조항이 있다. 현재는 무과금

### ③ 머스크 — 반드시 "Track and Trace Plus"를 신청하십시오

**상품을 잘못 고르면 유료가 됩니다.** 이것만 지키면 됩니다.

- 포털: <https://developer.maersk.com/register> → 가입 → My Apps 에서 App 생성(Consumer-Key 발급)
- 카탈로그(<https://developer.maersk.com/catalogue>)에서 신청할 상품:

| 신청할 것 | 신청하면 안 되는 것 |
|---|---|
| ✅ **Track and Trace Plus** (표시명 Ocean Track & Trace) | ❌ **Ocean Track & Trace Public Access** |
| `monetized:false` · 체험기간 없음 · 4,000콜/시간 | `monetized:true` · 30일 후 Starter/Growth/Scale 유료 |

- 신청서에 **Maersk Customer Code** 를 반드시 기재(수동 승인 · 거래 중인 화주·포워더만 승인)
- 발급물: Consumer-Key + **Client ID / Client Secret**(OAuth). 세 개 다 필요하다
- 제약: **태웅이 머스크에 직접 부킹한 화물만** 조회된다(당사자 아니면 404). 자사 물동량 추적이 목적이니 문제없다
- 계약서·Order Form·결제 정보를 요구하는 화면이 나오면 **잘못된 상품(Public Access)** 이다. 즉시 중단하고 알려주십시오

### ④ ZIM — ✅ 발급 완료 (2026-08-18)

- 포털: ZIM 개발자 포털에서 무료 계정 생성 → 제품별 접근 승인 요청
- 무료 근거: EULA 1.7 "Currently ... at no cost". 유일한 공개 한도는 **사용자당 동시 호출 10건**
- 유의: ZIM 이 **30일 사전 서면통지**만 하면 유료 전환할 권리를 약관에 남겨뒀다. 통지 오면 알려주십시오

**실발급 과정에서 확인된 함정 3가지 (2026-08-18 실측):**

1. **자격증명이 세 개다.** ZIM 은 인증 관문이 2단이라 셋 다 있어야 한다.
   - 구독 키(32자 16진수): 포털 로그인 → Profile → Subscriptions 의 **Primary key [Show]**. 메일로는 안 온다
   - Client ID(GUID) + Client Secret(`~` 포함 40자): 승인 메일 2통으로 온다
   - **메일의 "Secret value" 를 구독 키로 넣으면 `invalid subscription key` 로 실패한다** — 용도가 다르다
2. **토큰 발급 주소가 비표준이다.** `POST https://apigw.zim.com/authorize/v1`
   (`grant_type=client_credentials` + client_id + client_secret + **`scope=tracing`**).
   scope 는 Entra 표준 `{appIdUri}/.default` 형식이 아니라 제품별 짧은 문자열이며,
   게이트웨이가 내부에서 `api://apim-prod-tracing` 으로 번역한다.
   `login.microsoftonline.com` 을 직접 호출하면 이 번역이 없어 **영원히 실패**한다
3. **API 호출 시 헤더 둘 다 필수.** `Ocp-Apim-Subscription-Key` + `Authorization: bearer {jwt}`.
   토큰 유효 1시간 — 동시 호출 10건 제한이 있으니 어댑터는 토큰을 캐시한다(구현 완료)

### ⑤ MSC — ❌ 제외 (2026-08-18 사용자 지시)

> **계약(Data Sharing Agreement) 서명이 필요해 제외한다.** 무료라도 계약·영업 접촉이 끼면
> 진행하지 않는다는 방침. 아래 절차는 향후 방침이 바뀌면 쓸 수 있게 기록만 남긴다.

무료지만 셀프서비스가 아니다. 시간이 가장 오래 걸리니 다른 선사와 **병행**하십시오.

- 절차: 통합 신청서 제출 → MSC 담당팀 접촉 → **Data Sharing Agreement 서명**
- 무료 조건: **반드시 MSC 와 직접(direct) 연결**. 제3자 벤더를 경유하면 유료다
- 한도: 100,000콜/일 · 초당 4콜 (상향 불가). 고객사당 연결 1개
- 주의: 솔루션 프로바이더를 끼우자는 제안이 오면 거절하십시오 — 그 순간 유료가 됩니다

## 4. 키가 나오면 — 값을 채팅·메일에 붙여넣지 마십시오

**Supabase → Project Settings → Edge Functions → Secrets** 에 직접 등록합니다.

| Secret 이름 | 선사 | 비고 |
|---|---|---|
| `MAERSK_CONSUMER_KEY` | 머스크 | 필수 |
| `MAERSK_CLIENT_ID` · `MAERSK_CLIENT_SECRET` | 머스크 | Private 상품은 OAuth 필수 |
| `HLAG_CLIENT_ID` · `HLAG_CLIENT_SECRET` | 하파그로이드 | 한 쌍 |
| `HMM_API_KEY` | HMM | 어댑터 완료 — 키만 넣으면 동작(계정 승인 대기 중) |
| `ZIM_API_KEY` · `ZIM_CLIENT_ID` · `ZIM_CLIENT_SECRET` | ZIM | ✅ 등록 완료 — 셋 다 필수(2단 인증) |
| ~~`MSC_API_KEY`~~ | ~~MSC~~ | 제외 — 계약 필요(등록 안 함) |
| ~~`CMACGM_API_KEY`~~ | ~~CMA CGM~~ | **등록 금지 — 유료 선사** |

**`MAERSK_ALLOW_PAID` 는 절대 등록하지 마십시오.** 이 값이 `1` 이면 머스크 유료 엔드포인트가
폴백에 추가됩니다. 계약을 정식 체결한 경우에만 씁니다(기본값은 무료 경로 단독).

## 5. 개발 현황

| 선사 | 어댑터 | 상태 |
|---|---|---|
| 머스크 | DCSA 공용 | ✅ 완료 — 키만 넣으면 동작(무료 경로 단독) |
| 하파그로이드 | DCSA 공용 | ✅ 완료 — 키만 넣으면 동작 |
| HMM | DCSA 공용 | ✅ 완료 — 키만 넣으면 동작(계정 승인 대기 중) |
| ZIM | DCSA 공용 + OAuth | ✅ 완료 — 2026-08-18 실조회 검증(live) |
| MSC | — | ❌ 제외(계약 필요 — 2026-08-18 사용자 지시) |

머스크·하파그·HMM 은 **키 등록 즉시 재배포 없이 실조회로 승격**된다(ZIM 으로 검증된 메커니즘).
MSC 는 계약이 필요해 제외했다 — 남은 API 대상은 키만 넣으면 끝난다.

## 6. 공통 리스크 — 알고 계셔야 할 것

무료로 확인된 5사 **전부** 약관에 유료화 권리를 유보하고 있다. "영구 무료"를 계약으로 보장한
선사는 하나도 없다.

- 머스크 API License Terms 4조 · HMM 약관 제17조① · ZIM EULA 1.7(30일 통지) · 하파그 약관 §5.1
- 대응: 선사에서 **요금 관련 통지 메일이 오면 즉시 알려주십시오.** 해당 어댑터를 끄고 딥링크로
  되돌리면 되며(Secrets 에서 키만 지우면 됨) 비용이 발생하기 전에 차단할 수 있다.
