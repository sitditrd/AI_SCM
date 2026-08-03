# NLIC 벤치마킹 기반 TWL Control Tower 고도화 로드맵

v1.1 · 2026-07-31 작성 · 2026-08-03 구현 현황 갱신

> 작성 근거: 2026-07-31 실시한 4건 리서치(NLIC 메뉴 구조 조사, data.go.kr 오픈API 인벤토리 조사, 선박 위치 API 구현 방안 조사, TWL 8화면 벤치마크 매핑). 본 문서는 리서치에서 확인된 사실만 기재하며, 확인되지 않은 사항은 "협의 필요"·"미확인"으로 명시한다.

---

## 1. 요약 — NLIC에서 배울 것 3줄

1. **화면 구성은 NLIC/GLIP을 벤치마크하되, 데이터는 data.go.kr에서 수급한다.** NLIC에는 자체 오픈API 메뉴가 없고(구 안내 URL `/nlic/openApiInfo.action`은 404), NLIC 계열 데이터는 국토교통부·해양수산부 명의로 공공데이터포털(data.go.kr)에 개방되어 있다. 해수부 계열(기관코드 1192000) API는 전부 무료 + 자동승인이라 즉시 사용 가능하다.
2. **NLIC 신포털(GLIP)의 핵심은 "모니터링(실시간 지도) + 운임·물동량 대시보드 + 선박/노선 조회"의 결합**이다 — Flight/Train/Ship 레이어, 운임 구간 표시, 수출입 TEU, 대륙철도(TSR·TCR·TMR·TMGR), 운임공표(O/F·BAF·CAF·LSS 등 항목 단위) 조회까지 하나의 포털에 묶었다. TWL도 개별 화면 나열을 넘어 "지도 + 통계 + 운임"을 교차 연결하는 방향이 벤치마크 포인트다.
3. **개별 선박의 실시간 위치는 국내 공공 API로는 확보 불가**(data.go.kr은 해역별 척수 통계만 개방). 무료로는 AISStream.io 웹소켓(연안 ~200km) + PORT-MIS 입출항 실적(ATA/ATD)의 하이브리드가 현실적 대안이며, NLIC GLIP 자체도 자사 선박추적을 Deepvue 지도 iframe으로 처리한다.

---

## 2. NLIC 서비스 맵 (2026-07-31 기준)

nlic.go.kr은 현재 **2개 포털이 병존**한다.

### 2-1. 신규 GLIP 포털 (Global Logistics Information Portal)

메인: `https://www.nlic.go.kr/nlic/glip.action` · 백엔드 API 서버: `https://glip-api.deepvue.vvnst.com` (사이트 자체 사용 목적 — 무단 재사용 부적절)

| 대분류 | 주요 서비스 | 비고 |
|---|---|---|
| 물류정보 | 무역/컨테이너/통관 프로세스 정보 (게시판형) | BBS10000ML.action |
| 경제동향 | 대시보드, 세계/국내 경제지표, **운임 추이**(항공 `/api/fare/airport`·해상 `/api/fare/port`), 물동량 추이, 원자재 가격, 항만 혼잡지수, **운임 및 요금 공표 조회**(DAT10008MV) | 운임공표: 항로·선적지·양하지·O/F·BAF·CAF·LSS·EBS·THC·DF·DO 등 항목 단위 조회 |
| 유관기관 | 링크 디렉터리 11개 분류(물류기업, 물류IT, 항만물류, 해운외항 등) | |
| 뉴스 | KOTRA 해외 시장뉴스, 물류 데이터/법·규제 | `/api/kotra/oversea-news` |
| 선박조회 | **선박조회**(SMA10001MV — Vessel Name/IMO/MMSI/Call Sign 검색, Deepvue 지도 iframe 실시간 추적), **Route Information**(SMA20001ML — 해운/항공 탭, 출발·도착지+출발일자+항공사, Carrier/FLT/STD·ETD·ATD/STA·ETA·ATA/Flying Time/Status) | |
| 자료실 | 자료실, 국가 지역 정보(`/api/kotra/nation-info`) | |
| 모니터링 | **실시간 지도**(mainMap.action — Flight/Train/Ship 레이어, 항공·해상 운임 구간, 부산·인천항 기점 수출입 TEU, TSR·TCR·TMR·TMGR, 공항 순위, 운송편/선박 상세), 이벤트 모니터링, 항공/항만 스케줄, 항만 수출입 물동량(EXPORT_TEU·IMPORT_TEU·환적 TEU), **글로벌 물류 공급망 지도**(supplyChainMap — 항로·대륙철도·거점 정보) | |

### 2-2. 구 NLIC 포털 (물류통계·물류시설 중심, 병존 운영)

사이트맵: `/nlic/siteMap.action`. 구 '해상물류/항공물류/육상물류' 대분류는 폐지되고 '물류통계' 하위로 재편됨.

| 대분류 | 주요 서비스 |
|---|---|
| 물류통계 | 생활물류(택배), 내륙화물(도로 O·D/품목별, 철도, 의왕ICD), **해운화물**(항만별/품목별/국가별 물동량, 선박입출항 통계, 국내 해상운임지수 KCCI·KDCI, 국외 SCFI·CCFI·BDI), **항공화물**(공항별/노선별/수출입 물동량, 수송실적 등 13종), 전자상거래, 물류창고업, 운송수단 통계 |
| 물류시설 | 물류창고업 현황(등록년도·상호·소재지·취급품목·창고구분), 물류단지/터미널/내륙물류기지/공영차고지/화물차휴게소, **물류시설 검색서비스 지도**(InfoLogisMap) |
| 잔존 조회 서비스 | **선박운송스케줄정보(컨테이너터미널 선석)** `ciSchdlSpace0010.action` — 터미널+입항예정일자 → 선석·터미널항차·선사항차·Call Sign·양하/적하 물량·입출항예정일시·Closing Time·모선명, 물류대시보드(SCFI·CCFI·BDI 5년/주간) `ocnStatisticBoard.action` |
| 기타 | 새소식(물류뉴스·정책보도), 물류자료실, 물류인력DB, 센터소개 |

**출처**: [GLIP 메인](https://www.nlic.go.kr/nlic/glip.action) · [모니터링 지도](https://www.nlic.go.kr/nlic/mainMap.action) · [선박조회](https://www.nlic.go.kr/nlic/sma/SMA10001MV.action) · [Route Information](https://www.nlic.go.kr/nlic/sma/SMA20001ML.action) · [운임공표](https://www.nlic.go.kr/nlic/dat/DAT10008MV.action) · [공급망 지도](https://www.nlic.go.kr/nlic/supplyChainMap.action) · [구 포털 사이트맵](https://www.nlic.go.kr/nlic/siteMap.action) · [터미널 선석 조회](https://nlic.go.kr/nlic/ciSchdlSpace0010.action) · [물류시설 지도](https://nlic.go.kr/nlic/InfoLogisMap.action)

---

## 3. 활용 가능한 오픈API 인벤토리

공통: data.go.kr 회원가입 → 활용신청 → serviceKey 발급 → REST(XML/JSON). 트래픽 기본 개발계정 10,000건/일(운영계정은 활용사례 등록 후 증량 신청). **아래 전부 무료.**

| API 명칭 (데이터ID) | 기관 | 인증/승인 | 무료 | 주요 데이터 | TWL 활용처 |
|---|---|---|---|---|---|
| 선박운항정보 = PORT-MIS 입출항현황 (15006353) | 해수부 | data.go.kr 자동승인 | 무료 | 항구명, 입출항시간, 선박명, 국가코드, 총톤수, 출항지, 차항지 | vessel/berth — ETA 검증, ATA/ATD 실적 |
| 선박제원정보 (15055851) | 해수부 | 자동승인 | 무료 | 선박명, 호출부호, 총톤수, 길이, 너비 | vessel — 선박 클릭 제원 팝업, 마스터DB |
| 관제정보 (15006354) | 해수부 | 자동승인 계열 | 무료 | 관제구분, 교신시간, 계선장소 | vessel — 입출항 이벤트 타임라인 |
| 항만별 선박입출항실적 통계 (15059059) | 해수부 | 자동승인 | 무료 | 연월별 항만청별 입출항 척수·총톤수 | insight/status — 물동량 트렌드, 교차검증 |
| 수출입컨테이너처리실적 통계 (15059131) | 해수부 | 자동승인 | 무료 | 수출입·적공 컨테이너 TEU | index KPI, insight TEU 추이 |
| 국가별컨테이너처리실적 (15057250) | 해수부 | 자동승인 계열 | 무료 | 국가/지역별 TEU 실적 | route — 항로별 물동량 근거 |
| 내항컨테이너반출입정보 (15058585) | 해수부 | 자동승인 | 무료 | 반출입 구분, 컨테이너 번호·규격, TEU | 터미널 반출입 모니터링 |
| 선박위치정보(연안AIS) 통계 (15084033) | 해수부 | 자동승인 | 무료 | 1시간 단위 해역별 척수 집계 (WMS/WFS) — **개별 좌표 미제공** | vessel — 밀집도 보조 레이어 |
| 화물통관진행정보 (15126268) | 관세청 | **UNI-PASS 회원가입 + OpenAPI 별도 신청** (자동승인 아님) | 무료 | B/L·화물관리번호별 통관 진행상태, 장치장 위치 (최근 3년, XML) | cargo — 통관 트래킹 정식화 |
| 수출이행내역 (15126269) | 관세청 | GW 계열 (개발 자동/운영 심의) | 무료 | 수출신고번호별 이행·잔량 | cargo — 수출이행 탭 |
| 품목별/국가별 수출입실적(GW) (15101609/15101612) | 관세청 | 개발 자동승인 / **운영 심의승인** | 무료 | HS·국가별 수출입 금액·중량 (월 15일경 전월분) | route — 항로별 교역액 오버레이 |
| 관세환율정보(GW) (15101230) | 관세청 | GW 계열 | 무료 | 주간 관세환율 | 환율 자동갱신 |
| 화물편 운항현황 다국어 (15095068) | 인천공항공사 | 자동승인 | 무료 | 항공사, 편명, 예정/변경시간, 현황, 터미널 (개발 1,000/일, 운영 최대 1,000,000/일) | schedule — 항공화물 탭 |
| 화물기 운항현황 상세 (15113461) / 정기운항편 상세 (15114086) | 인천공항공사 | 자동승인 | 무료 | D-3~+6일 스케줄, 게이트, 상태 | schedule — 항공 스케줄 |
| 인천항 선박 입출항 정보 (15157706) | 인천항만공사 | 자동승인 | 무료 | 입출항 시간, 선석, 항차, 출항지/입항지 | berth — 인천항 특화 |
| 여수광양 부두별 컨테이너 통계 (15058829) / 월별 입출항 (15057693) | 여수광양항만공사 | 자동승인 계열 | 무료 | 부두별 처리량, 월별 입출항 | berth/insight — 광양항 |
| 한국수출입은행 환율 (3068846) | 수출입은행 | data.go.kr 신청 (도메인 oapi.koreaexim.go.kr) | 무료 | 일일 고시환율 | index — 환율 KPI 스트립 |
| 기상특보 조회 (15000415) / 중기예보 (15059468) | 기상청 | 자동승인 계열 | 무료 | 특보 발효 현황, 해상 중기예보 | index 티커, route 몬테카를로 |
| 해양기상부이/파고부이 | 기상청 (data.kma.go.kr API허브) | 별도 포털 신청 | 무료 | 파고·파주기·수온 관측치 | insight/berth — 실측 병기 |
| (참고) DCSA Commercial Schedules — Maersk Freemium | Maersk (developer.maersk.com) | 개발자 포털 가입 | Freemium | P2P 운항 옵션·T/T | schedule — 선사 정시 스케줄 1차 후보 |

파일데이터(API 아님, CSV): 선박입항신고(15128161), 선박관제정보(15128156), 선박입출항현황(15083024), 항만시설제원코드(15119666), 컨테이너터미널정보(15114130), 선박원부등록정보(15133094), 물류창고업등록정보(15083282).

**핵심 시사점**
- 해수부 계열(1192000)은 전부 무료+자동승인 → 키 하나로 즉시 착수 가능.
- 관세청은 이원화: 무역통계(GW)는 data.go.kr(운영단계 심의), **화물통관진행정보는 유니패스 별도 신청** 경로.
- NLIC 자체는 API 소스가 아닌 **기능 벤치마크 대상**으로 취급하고, 데이터는 data.go.kr 동등 API로 대체한다.
- PORT-MIS 파일데이터의 자동 API 변환분(15128156·15128161)은 실시간성이 낮음 → 실시간 요건에는 15006353·15006354 우선.

---

## 4. 화면별 고도화 로드맵 (8화면)

현황: 정적 웹 8화면 + Supabase 3계층. 기존 데이터 — 선석배정 16터미널(자체 수집), IMF PortWatch 기반 PCI, SCFI/CCFI, Open-Meteo 기상(예보·이력), VesselFinder AIS(iframe) + **자체 AIS 수신(AISStream → `vessel_positions`, 2026-08-03 가동)**, UNIPASS 프록시(키 미등록), 경로분석 93개 사전계산 항로, 해외 스케줄 준비중(FR-04/05).

우선순위 기준 — **P1**: 무료·자동승인 API + 난이도 하로 즉시 효과 / **P2**: 자동승인이지만 가공·설계 필요(난이도 중) 또는 별도 신청 절차 수반 / **P3**: 협의·심의·정식 API 부재 등 외부 의존.

### index (메인 대시보드)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 환율 KPI 스트립(USD/CNY 등) | 수출입은행 환율 (3068846) | 하 | P1 |
| 항만 물동량 월간 KPI(TEU) | 수출입컨테이너처리실적 (15059131) | 하 | P1 |
| 기상특보 티커(항만 인접 해역) | 기상청 기상특보 (15000415) | 하 | P1 |

### insight (항만 혼잡 인사이트)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 포트 상세 월별 TEU 추이 오버레이 | 국가별(15057250)·수출입(15059131) 컨테이너 실적 | 하 | P1 |
| PCI 국내항 보정 — 실측 입출항 횟수·톤수 반영 | 선박운항정보 (15006353) · 입출항실적 통계 (15059059) | 중 | P2 |
| 해양 관측 실측 위험 가중(파고부이) | 기상청 해양기상부이 (data.kma.go.kr) | 중 | P2 |

### berth (선석 배정)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 기상 카드에 관측 실측치 병기(Open-Meteo 예보 보완) | 기상청 해양기상 관측 (data.kma.go.kr) | 하 | P1 |
| 16터미널 → 전국 28무역항 입항신고 확장 | PORT-MIS 선박입항신고 (15128161, 파일→API 변환분·실시간성 낮음) + 실시간 보완은 15006353 | 중 | P2 |
| 컨테이너 반출입 예정 연계(마감임박 행 표시) | 인천항 iCON 등 — **정식 오픈API 부재, 항만공사별 확인 필요** | 상 | P3 |

### vessel (선박 추적)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 선박 클릭 시 제원 팝업(톤수·선종 등) | 선박제원정보 (15055851) | 하 | P1 |
| VTS 관제 교신 기반 입출항 이벤트 타임라인 | 관제정보 (15006354) | 중 | P2 |
| 연안 AIS 통계 레이어(iframe 의존 완화) | 연안AIS 통계 (15084033, WMS/WFS) | 중 | P2 |
| 자체 실시간 위치 지도(§5 참조) — **구현 완료(2026-08-03)**: 매시 30분 AISStream 웹소켓 90초 수신 → `vessel_positions`(48h 보존) → vessel.html Leaflet 지도(5분 재조회) | AISStream.io + PORT-MIS | 중 | P2 → 완료 |
| PORT-MIS 입출항 실적 조회 섹션 — **실조회 가동(2026-08-03)**: Edge Function `datago?api=portmis` 경유, 키 등록·파라미터 규격 교정(`sde`/`ede`) 완료 | 선박운항정보 (15006353) | 하 | P1 → 완료 |

### cargo (통관/화물)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 통관 실조회 정식화(프록시에 키 등록) + B/L 진행상태 | 관세청 화물통관진행정보 (15126268, **유니패스 별도 신청**) | 하 | P1* (키 발급이 선결) |
| 장치장(보세구역) 위치 정보 표시 | UNIPASS 장치장 정보 API | 하 | P2 |
| 수출이행내역·검사검역 조회 탭 | 수출이행내역 (15126269) · UNIPASS 검사검역 | 중 | P2 |

### route (경로 분석)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 항로별 컨테이너 물동량 근거 제시 | 국가별컨테이너처리실적 (15057250) | 하 | P1 |
| 항로별 교역액 오버레이 | 국가별 수출입실적(GW) (15101612, 운영 심의) | 중 | P2 |
| 몬테카를로 변수에 계절 파고 반영 | 기상청 중기예보 (15059468) | 상 | P3 |

### schedule (해외 스케줄 — 준비중, FR-04/05 소스 확정에 직결)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 항공 화물편 스케줄 탭(해상+항공 허브화) | 인천공항 화물기 정기운항편 (15114086) · 운항현황 다국어 (15095068) | 하 | P1 |
| 선사 P2P 스케줄 조회(1차 소스) | DCSA Commercial Schedules — Maersk Freemium 등 | 중 | P2 |
| 국내 터미널 입항예정(모선-항차) — NLIC `ciSchdlSpace0010` 동급 기능 | NLIC·OTS(ldsp.mof.go.kr)는 화면 제공형 — **API화 협의 필요** | 중 | P3 |

### status (시스템 현황)
| 후보 기능 | 필요 API | 난이도 | 우선순위 |
|---|---|---|---|
| 외부 API 의존 소스 헬스체크 확장(UNIPASS·기상·환율) — **1차 구현(2026-07-31)**: status.html SECTION 05에 Edge Function track·datago(needKey→정상(키 대기))·send-code(OPTIONS)·Open-Meteo 4종 45초 점검 | 각 연동 API 자체 (신규 데이터 불필요) | 하 | P1 |
| NLIC 항만별 물동량 벤치마크 위젯 | 해수부 통계 API로 대체 (15059131 등) | 하 | P1 |
| 자체 적재분 vs 공식 실적 교차검증 배너 | 항만별 입출항실적 통계 (15059059) | 중 | P2 |

**공통 유의사항**: 정적 사이트 특성상 CORS 불가 API는 기존 패턴(Edge Function 프록시 또는 배치 적재)으로 수용. `DATA_GO_KR_KEY`·`UNIPASS_API_KEY` 확보(README §B)가 선결 조건.

---

## 5. 선박 위치 구현 전략

### 5-1. 방식 비교

| 방식 | 비용 | 실시간성 | 커버리지 | 구현 난이도 | 제약 |
|---|---|---|---|---|---|
| **현행: VesselFinder 지도 iframe** | 무료 | 준실시간 | 글로벌 (임베드 화면) | 완료 | 데이터 미보유 — 자체 가공·알림 불가, 외부 의존 |
| **AISStream.io 웹소켓** — 채택·가동(2026-08-03) | 무료 (키 발급·등록 완료) | 초 단위 스트리밍 | 지상파 AIS — 해안선 ~200km 이내(한국 연안 커뮤니티 수신국 존재, 공식 보장 없음). 원양 불가 | 중 — 서버측 상주 WebSocket(연결 후 3초 내 구독 JSON, BoundingBox·MMSI 필터), 재접속 처리. **브라우저 직결 불가(CORS)** | 베타·SLA 없음, 상용 이용 조건 약관 확인 필요 |
| **PORT-MIS 선박운항정보 (15006353)** | 무료 | 실시간 갱신(이벤트성 실적) | 국내 항만 입출항 | 하 (REST/XML) | 위치 아님 — 입출항 시각·출항지·차항지만 |
| **GICOMS/KODIS·data.go.kr 공공 AIS** | 무료 | 1시간 집계 | 해역별 척수 통계만 | 하 (WMS/WFS) | **개별 선박 실시간 위경도 API 자체가 없음** (통계로 가공 개방) |
| **VesselFinder API (유료)** | 최소 10,000크레딧 = €330 (12개월) | 준실시간, 위성 포함 원양 커버 | 글로벌 | 하 (REST) | 지상파 1크레딧/건, 위성 10크레딧/건 — 소진 관리 필요, 무료 티어 없음 |
| **MarineTraffic (Kpler)** | 영업 협의 (가격 비공개) | 준실시간 | 글로벌 | 하 | 크레딧제 폐지 → 엔터프라이즈 계약만 |

### 5-2. 추천안 (하이브리드, 단계별)

1. **1단계 (무료 PoC) — 완료 (2026-08-03)** — AISStream.io를 한국 해역 바운딩박스로 구독 → Supabase `vessel_positions` 적재(48시간 보존) → vessel.html 자체 Leaflet 지도(5분 재조회) 표시. 상주 백그라운드 워커 대신 **매시 30분 스케줄러(`ais-positions-collect`)가 웹소켓에 90초간 접속해 스냅샷을 받는 방식**으로 구현했다. 비용 0으로 연안 실시간 확보. 현행 VesselFinder iframe은 글로벌 조망용으로 병행 유지.
2. **2단계 (실적 보강)** — PORT-MIS 선박운항정보(15006353)로 ATA/ATD를 결합해 입출항 이벤트를 확정하고 AIS 수신 공백을 보완. 연안AIS 통계(15084033)는 밀집도 보조 레이어로만.
3. **3단계 (원양·상용화 시)** — 원양 위성 AIS가 필요해지면 VesselFinder 크레딧(€330~)을 저빈도 폴링(예: 6시간 간격)으로 추가. MarineTraffic은 예산 협의 가능할 때만 검토.

국내 공공 소스(GICOMS/data.go.kr)는 개별 위치 미개방이므로 위치 추적 원천에서 배제한다.

---

## 6. 실행 순서 제안

### A. 사용자 액션 필요 (키 발급·신청 — 개발 착수 전 선결)

| 순서 | 액션 | 소요/방식 |
|---|---|---|
| A-1 | ~~**data.go.kr 회원가입 + 활용신청 + 키 등록**~~ → **완료(2026-08-03)**: 12종 전부 자동승인(15006353, 15055851, 15006354, 15059059, 15059131, 15057250, 15095068, 15113461, 15114086, 15157706, 15000415, 15059468 — 만료 2028-08-03) + `DATA_GO_KR_KEY` Supabase Secrets 등록 + **별칭 15종 실조회 검증 완료(NORMAL_SERVICE)**<br>※ 15084033(연안AIS 통계)·3068846(수출입은행 환율)은 **API 유형 LINK** — data.go.kr이 키를 발급하지 않고 외부 포털(WMS/WFS, oapi.koreaexim.go.kr)로 연결되므로 활용신청 대상이 아니다. 환율이 필요하면 수출입은행 자체 포털에서 별도 발급해야 한다(A-7). | 완료 |
| A-2 | **UNI-PASS 회원가입 + OpenAPI 별도 신청** → `UNIPASS_API_KEY` 확보 (화물통관진행정보 15126268 등) | data.go.kr 자동승인과 다른 별도 절차 |
| A-3 | ~~**AISStream.io 키 발급**~~ → **완료(2026-08-03)**: `AISSTREAM_API_KEY` 등록, 스케줄러 ⑤ 가동 | 즉시 — 완료 |
| A-4 | 기상청 data.kma.go.kr API허브 가입 (해양부이 관측) | 별도 포털 |
| A-5 | (schedule 대비) Maersk developer.maersk.com Freemium 가입 | 2단계 시점 |
| A-6 | (해당 시) 관세청 GW 계열 운영단계 **심의승인** 신청 — 15101609/15101612 등 | 심의 소요 감안, 개발계정으로 선행 개발 |
| A-7 | (index 환율 KPI 착수 시) 한국수출입은행 **oapi.koreaexim.go.kr 자체 포털**에서 환율 API 키 발급 — data.go.kr 3068846은 LINK형이라 키를 주지 않음 | 별도 포털 |

> **구현 현황 (2026-08-03)**
> - **완료**: data.go.kr **활용신청 12종 승인 + `DATA_GO_KR_KEY` 등록 + 실조회 검증**(A-1). 이에 맞춰 `datago` 프록시를 **v5까지 확장** — 별칭 15종(해수부 6·인천공항 5·인천항만 2·기상청 2), 기관별 JSON 파라미터(`type`/`dataType`/미지원)·페이징(`pageNo` / `skipRow`+`endRow`) 자동 분기, **XML 응답 자동 JSON 변환**, 인증키 Decoding/Encoding 정규화, `?api=list` 별칭 조회. 기존 `track`(유니패스)·`send-code`(인증코드)와 합쳐 Edge Function 3종.
> - **완료(버그 수정 4건)**: ① 해수부·인천항만 계열은 XML 전용이라 v1에서는 `data`가 비어 vessel.html이 결과를 표시하지 못하던 문제 → XML→JSON 변환으로 해소 ② vessel.js의 PORT-MIS 날짜 파라미터를 규격에 맞게 `fromDt/toDt` → **`sde`/`ede`** 로 수정 ③ Encoding 키 등록 시 이중 인코딩으로 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(코드 30) → `normalizeKey()` 도입 ④ 인천항만공사 계열에 `pageNo`를 주입해 코드 99(`Invalid parameter`) → `paging: "row"`(skipRow/endRow) 분기.
> - **실조회 검증 결과(15/15 NORMAL_SERVICE)**: portmis 296건·shipspec 145건·vtscontrol 321건·portstat 90건·teuimpexp 36건·teunation 508건·aircargoarr 739건·aircargodep 744건·airschedarr 485건·airscheddep 499건 등. 파라미터 규격은 API.md §2.3 표 참조(특히 통계 3종은 **소문자 `sym`/`eym`**, 인천항만은 **`YYYY-MM-DD` 하이픈 날짜**).
> - **완료**: 선박 위치 1단계 PoC(§5-2) — `AISSTREAM_API_KEY` 등록 → 스케줄러 ⑤ `ais-positions-collect`(매시 30분) → `vessel_positions` → vessel.html 자체 지도.
> - **대기**: `UNIPASS_API_KEY`(A-2)만 미등록. Supabase Secrets에 등록하는 즉시 **코드 수정 없이** 통관 실조회가 켜진다.

### B. 키 확보 즉시 개발 가능 (P1 — 난이도 하)

> **선결 조건 해소 완료(2026-08-03)** — `DATA_GO_KR_KEY` 등록·검증이 끝나 아래 1~5는 **즉시 착수 가능**하다. 프록시 별칭 15종이 이미 열려 있으므로 각 항목은 Edge Function 수정 없이 화면 코드만 붙이면 된다.

1. index: 물동량 TEU KPI(`datago?api=teuimpexp`) · 기상특보 티커(`api=wthrwarn`) — 환율 KPI는 A-7(수출입은행 자체 포털 키) 선결
2. vessel: 선박 제원 팝업 (15055851 · `api=shipspec`)
3. insight: 월별 TEU 추이 오버레이 (15057250·15059131 · `api=teunation`/`teuimpexp`)
4. route: 항로별 물동량 근거 (15057250 · `api=teunation`)
5. schedule: 항공 화물편 탭 (15114086·15095068 · `api=airschedarr`/`airscheddep`/`aircargo`)
6. status: 헬스체크 확장(신규 데이터 불필요 — **키 없이도 착수 가능**) — **1차 구현 완료(2026-07-31, §4 status 표 참조)** · 물동량 벤치마크 위젯(미구현)
7. cargo: UNIPASS 프록시에 키 등록 → 통관 실조회 정식화 (A-2 완료 즉시)

### C. 설계·가공 수반 (P2)

- insight PCI 실측 보정(15006353+15059059), vessel 관제 타임라인(15006354)·연안AIS 레이어(15084033)
- ~~**선박 위치 1단계 PoC**~~ → **완료(2026-08-03)**: AISStream 수신(스케줄러 ⑤, 매시 30분 90초) + `vessel_positions` 적재(48h 보존) + vessel.html 자체 Leaflet 지도
- berth 28무역항 확장, cargo 수출이행·장치장, route 교역액 오버레이(운영 심의 병행), schedule DCSA/Maersk

### D. 외부 협의·확인 필요 (P3 — 착수 전 타당성 확인)

- 터미널 반출입 예정(iCON 등 — 정식 오픈API 부재), NLIC/OTS 터미널 입항예정 API화 협의, route 계절 파고 몬테카를로 반영, 원양 위성 AIS(VesselFinder 유료)

---

## 출처

### NLIC / GLIP
- https://www.nlic.go.kr/nlic/glip.action · https://www.nlic.go.kr/nlic/mainMap.action · https://www.nlic.go.kr/nlic/sma/SMA10001MV.action · https://www.nlic.go.kr/nlic/sma/SMA20001ML.action · https://www.nlic.go.kr/nlic/dat/DAT10008MV.action · https://www.nlic.go.kr/nlic/supplyChainMap.action
- 구 포털: https://www.nlic.go.kr/nlic/siteMap.action · https://nlic.go.kr/nlic/InfoLogisMap.action · https://nlic.go.kr/nlic/ciSchdlSpace0010.action · https://nlic.go.kr/nlic/ocnStatisticBoard.action · https://www.nlic.go.kr/nlic/seaDmstcOcn.action · https://www.nlic.go.kr/nlic/WhsInfoWarehouseSch.action · https://www.nlic.go.kr/nlic/seaHarborGtqy.action · https://www.nlic.go.kr/nlic/seaShipEtrypt.action · https://www.nlic.go.kr/nlic/spcVsslScheInfo.action
- JS: https://www.nlic.go.kr/nlic/glip/js/com/api.js · /nlic/glip/js/sma/sma10001.js · /nlic/glip/js/sma/sma20001.js · /nlic/glip/js/dat/dat10000.js · /nlic/glip/js/mainMap.js
- 보조: [국제신문 — KCCI·KDCI NLIC 제공](https://www.kookje.co.kr/news2011/asp/newsbody.asp?code=0200&key=20260616.22011004037) · [해수부 LDSP ISS](https://ldsp.mof.go.kr/spe/intro_iss.do)

### data.go.kr / 관세청 / 기상청
- https://www.data.go.kr/data/15006353/openapi.do · 15055851 · 15006354 · 15059059 · 15059131 · 15057250 · 15058585 · 15084033 · 15126268 · 15126269 · 15101609 · 15101612 · 15095068 · 15113461 · 15114086 · 15157706 · 15000415 · 15059468 · 3068846 (각 `www.data.go.kr/data/{ID}/openapi.do`)
- 파일데이터: https://www.data.go.kr/data/15083282/fileData.do · 15128161 · 15128156 · 15083024 · 15119666 · 15114130 · 15133094 · 15120920
- https://unipass.customs.go.kr/csp/index.do?tgMenuId=MYC_MNU_00000450 · https://www.customs.go.kr/kcs/openApi/view.do · https://cloudlog.kr/docs/programming/api/unipass-openapi-introduce/
- https://data.kma.go.kr/api/selectApiList.do

### 선박 위치
- https://aisstream.io/documentation · https://aisstream.io/coverage · https://github.com/aisstream/aisstream
- https://www.gicoms.go.kr/kodispub/api/EgovApiReqtForm.do · https://gicoms.go.kr/kodispub/cmm/main/mainPage.do · https://e-navigation.mof.go.kr/
- https://www.mof.go.kr/doc/ko/selectDoc.do?docSeq=4984&menuSeq=929&bbsSeq=27 · https://www.mof.go.kr/doc/ko/selectDoc.do?docSeq=4965&menuSeq=929&bbsSeq=27
- https://www.vesselfinder.com/vessel-positions-api · https://api.vesselfinder.com/docs/ · https://help.marinetraffic.com/hc/en-us/articles/205115108-Set-up-your-API-Services · https://datadocked.com/ais-api-providers · https://datalastic.com/pricing/

### 스케줄 / 벤치마크
- https://dcsa.org/standards/commercial-schedules · https://developer.maersk.com/api-catalogue/ocean-commercial-schedules-customerfreemium
- https://ldsp.mof.go.kr/spe/intro_ots.do · https://ldsp.mof.go.kr/lto/public.do?menuCd=117
- https://www.tradlinx.com/ko/container-terminal-schedule · https://scon.icpa.or.kr/index.do
