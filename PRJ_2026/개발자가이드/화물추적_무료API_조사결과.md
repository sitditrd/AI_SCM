# 화물 추적 무료 API 전방위 조사 결과

조사일 2026-07-28 · 멀티에이전트 4영역 병렬(국내 공공·해외 해상·선사·항공) + 종합 · 총 59건

## 국가물류통합정보센터(NLIC) / 해수부 LDSP
- 제공: 국토교통부(nlic.go.kr) / 해양수산부(ldsp.mof.go.kr) | 범위: 공통 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `웹 포털 — 공개 오픈API 엔드포인트 확인 안 됨`
- 데이터: NLIC: 항공물류정보시스템·통합PORT-MIS·철도물류 등 연계 정보와 물류 대시보드. LDSP: 선박 스케줄 정보 등 수출입 물류 데이터셋
- 키 발급: 해당 없음. LDSP(수출입 물류 공공·민간 데이터 공유 플랫폼)는 회원 가입 기반 데이터 신청 방식
- 검증: 실검증: 2026-07 기준 양 포털에서 공개 REST API 문서 미발견(웹 조회·데이터 신청 방식만 확인)
- 적합성: 직접 API 연동 불가. LDSP의 선박 스케줄 데이터는 추후 스케줄 화면 보강 시 데이터 신청 검토 가치가 있음

## 대한항공 카고 AWB 추적 내부 JSON API (비공식)
- 제공: 대한항공 (cargo.koreanair.com, Drupal+React 포털) | 범위: 항공 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `POST https://cargo.koreanair.com/cargoportal/services/trackawb  (본문: [{"awbPrefix":"180","awbDocNo":"12345675"}] 형식 JSON 배열, 최대 복수 AWB). 사전 단계: GET https://cargo.koreanair.com/en/tracking 에서 익명 GUEST JWT가 담긴 Authorization 쿠키 + SSESS 세션 쿠키 획득 후 동일 쿠키로 POST`
- 데이터: AWB(180-XXXXXXXX) 단위 실시간 추적: 구간별 항공편/일자, 마일스톤 이벤트, ULD 정보, 통관상태 조회(getcustomsstatus), 트래킹 리마크. 응답은 순수 JSON
- 키 발급: 키 불필요. 페이지 GET 한 번으로 role=GUEST 익명 JWT 쿠키가 자동 발급됨(로그인·가입 불필요). 쿠키 없이 직접 POST하면 401
- 검증: 2026-07-28 실호출 검증 성공. curl로 쿠키 획득 후 POST → HTTP 200, JSON {"generalInfo":{...},"messages":[{"code":"ESC504","text":"Invalid value."}]} (더미 AWB라 미존재 오류, 엔드포인트·인증·포맷 확인 완료). 쿠키 없이는 401 확인. 엔드포인트는 포털 번들 JS(app-content.js)의 URL 맵 {tracking:"/cargoportal/services/trackawb"}에서 추출
- 적합성: MAWB(180 프리픽스) 직결 추적에 최적. 서버(프록시)에서 쿠키 발급→POST 2단계로 호출하면 포털 화면에 바로 표출 가능. 단 비공식 내부 API라 사이트 개편 시 변경 리스크 있음 — 어댑터 계층으로 격리 권장. AWB 시리얼 검증(7자리 mod 7 = 체크디짓)도 화면 입력검증에 적용 가능

## 아시아나 카고 AWB 추적 JSON 엔드포인트 (비공식)
- 제공: 아시아나항공 (asianacargo.com) | 범위: 항공 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `POST https://www.asianacargo.com/tracking/searchTraceAirWaybillResult.do  (Content-Type: application/x-www-form-urlencoded, 본문: prefix=988&awbNumber=XXXXXXXX&_csrf={토큰}). 사전 단계: GET https://www.asianacargo.com/tracking/viewTraceAirWaybill.do?lang=en 에서 세션 쿠키와 hidden _csrf 값 파싱`
- 데이터: AWB(988-XXXXXXXX) 단위: 출발/도착지, 편명·일자, 개수·중량, 최신 이벤트, RCS/DEP/NFD/DLV 마일스톤별 계획/실적 시각 — 완전한 구조화 JSON
- 키 발급: 키 불필요. 페이지 GET으로 세션+CSRF 토큰만 확보하면 로그인 없이 호출 가능
- 검증: 2026-07-28 실호출 검증 성공. 더미번호 988-12345675가 실제 존재하는 AWB로 조회됨: {"success":true,..."origin":"LAX","destination":"ICN","statedPieces":1,"statedWeight":86.0,"rcsStatus":"GRAY",...} — 엔드포인트·파라미터·응답 구조 실데이터로 확인
- 적합성: 988 프리픽스 MAWB 추적에 최적. 응답이 마일스톤별 필드로 이미 구조화되어 있어 화면의 진행단계 바(수출반입→출발→도착통지→인도)에 그대로 매핑 가능. 비공식이므로 어댑터 격리 권장

## CHAMP Track & Trace 공개 조회 페이지 (track.champ.aero/{항공사코드})
- 제공: CHAMP Cargosystems (다수 항공사 위탁 호스팅) | 범위: 항공 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://track.champ.aero/{IATA 2자리 코드} (예: https://track.champ.aero/FI = 핀에어). AWB 최대 10건 동시 조회(콤마/세미콜론/공백 구분)`
- 데이터: CHAMP 커뮤니티 항공사들의 AWB 마일스톤 추적(FSU 기반). 항공사별 개별 인스턴스
- 키 발급: 불필요 (공개 웹 UI)
- 검증: 2026-07-28 실접속 확인 — 2026 저작권 표기의 살아있는 공개 조회 페이지, AWB 10건 입력 폼 확인
- 적합성: API가 아닌 웹 UI이므로 화면에서 '항공사 조회 바로가기' 딥링크 버튼으로 활용. CHAMP를 쓰는 중소 항공사 커버리지 보완용. (동사의 Traxon cargoHUB API는 유료)

## track-trace.com 항공화물 범용 딥링크
- 제공: track-trace.com (노르웨이, 20년+ 운영 애그리게이터) | 범위: 항공 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://www.track-trace.com/aircargo?number={AWB} (예: ?number=988-12345675). AWB 앞 3자리 프리픽스로 242개 항공사 자동 식별 후 해당 항공사 추적으로 연결`
- 데이터: 자체 데이터 없음 — 항공사 식별 + 각 항공사 공식 추적 페이지로의 'Track direct' 연결. 242개 항공사 커버
- 키 발급: 불필요
- 검증: 2026-07-28 실호출 검증 — GET ?number=988-12345675 가 Asiana로 자동 인식되어 Track direct 옵션 표시 확인
- 적합성: 포털에서 자체 연동이 없는 항공사의 AWB일 때 만능 폴백 링크로 최적. GET 딥링크라 AWB만 붙여 새 창으로 열면 됨. 데이터 수집(스크래핑) 용도는 아님

## IATA ONE Record (오픈 표준 + NE:ONE 오픈소스 서버)
- 제공: IATA (스펙: iata-cargo.github.io / 구현체: Open Logistics Foundation NE:ONE, IATA-Cargo GitHub) | 범위: 항공 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `표준 스펙 https://iata-cargo.github.io/ONE-Record/ , 오픈소스 서버 https://git.openlogisticsfoundation.org/wg-digitalaircargo/ne-one , Java 참조구현 https://github.com/IATA-Cargo/one-record-server-java`
- 데이터: 화물 단위 논리객체(LogisticsObject) 공유 표준 — AWB, 마일스톤, 센서 데이터까지 단일 레코드. IATA는 2026년까지 CargoIMP/CargoXML 대체를 추진 중
- 키 발급: 스펙·코드 모두 무료 공개. 단, 데이터는 각 항공사/조업사가 자사 ONE Record 엔드포인트를 열어줘야 받음(상호 계약 기반)
- 검증: IATA GitHub·Open Logistics Foundation 공개 저장소 확인. NE:ONE은 무료·오픈소스로 1시간 내 배포 가능하다고 공식 문서에 명시
- 적합성: 지금 당장 조회할 공개 데이터 소스는 아님. 중장기 과제: 태웅 포털에 NE:ONE 기반 수신 서버를 무료로 세워두면 KE 등 항공사가 ONE Record를 개방할 때 표준 연동으로 전환 가능. 단기 화면 강화에는 부적합

## 항공편 위치·운항 보강용 무료 API (OpenSky Network 등)
- 제공: OpenSky Network (비영리) / aviationstack 무료 티어 | 범위: 항공 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://opensky-network.org/api/states/all 등 REST (익명 호출 가능, 계정 등록 시 한도 상향)`
- 데이터: 항공기 실시간 위치(ADS-B) — AWB 아님, 편(flight) 단위
- 키 발급: 익명 무료(저한도) 또는 무료 계정 등록
- 검증: OpenSky 공개 REST API는 무인증 호출 가능함이 공식 문서에 명시(한도 있음). 이번 세션에서는 실호출 미실시
- 적합성: AWB 추적 결과의 탑재편을 지도에 실시간 표시하는 시각 보강용. 화물 상태 자체는 못 줌 — 보조 수단으로만

## ONE 공개 추적 딥링크 (eComm Cargo Tracking)
- 제공: Ocean Network Express (ecomm.one-line.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?ctrackNo={B/L 또는 컨테이너번호}`
- 데이터: B/L(SELC 12자리)·부킹·컨테이너 번호로 이벤트 이력, 선박/항차, ETA 조회 화면.
- 키 발급: 불필요 — 로그인 없이 접근 가능한 공개 페이지.
- 검증: curl 실호출 HTTP 200 확인(2026-07-28, ctrackNo 파라미터 포함 URL).
- 적합성: ONE은 셀프서비스 개발자 포털이 없어 API 연동은 불가(고객 EDI/API는 영업 경유). cargo 화면에서 '선사 사이트에서 보기' 딥링크 버튼으로 최적 — 번호 프리필 파라미터(ctrackNo) 지원.

## Evergreen ShipmentLink 공개 추적
- 제공: Evergreen Line (ct.shipmentlink.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do (퀵링크 파라미터 TYPE=QUICK&NO={번호} 형태 허용)`
- 데이터: B/L·컨테이너·부킹 번호로 이벤트/스케줄 조회 화면.
- 키 발급: 불필요 — 공개 페이지. 공식 API 포털은 없음(EDI는 고객 계약).
- 검증: curl 실호출 HTTP 200 + 응답 본문에 Tracking/B/L 폼 렌더링 확인(2026-07-28).
- 적합성: Evergreen 건 딥링크 연결용. 결과는 HTML 화면이므로 파싱보다는 새 창 링크 방식 권장.

## HMM 웹 Track & Trace 딥링크
- 제공: HMM (www.hmm21.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do`
- 데이터: B/L·부킹·컨테이너 번호 조회 화면(로그인 불필요).
- 키 발급: 불필요.
- 검증: curl 실호출 HTTP 200 확인(2026-07-28).
- 적합성: API 포털 승인 대기 기간의 브리지로 딥링크 버튼 제공에 적합.

## Maersk / CMA CGM 웹 추적 딥링크
- 제공: Maersk(www.maersk.com), CMA CGM(www.cma-cgm.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `Maersk: https://www.maersk.com/tracking/{번호} / CMA CGM: https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={번호} (SearchBy=BL 도 가능)`
- 데이터: 컨테이너/B/L 이벤트 조회 화면.
- 키 발급: 불필요.
- 검증: curl 실호출: maersk.com 502, cma-cgm.com 403(봇차단) — 브라우저 접근용 표준 공개 패턴.
- 적합성: 딥링크 버튼용. 두 사이트 모두 봇차단(서버측 curl 각각 502/403 확인)이라 서버 스크래핑은 불가 — 사용자 브라우저 새 창 연결만 유효.

## 고려해운 KMTC e-KMTC 공개 조회
- 제공: KMTC (www.ekmtc.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://www.ekmtc.com/index.html#/cargo-tracking (SPA, 백엔드 api.ekmtc.com은 Akamai 보호)`
- 데이터: MBL·부킹·컨테이너 번호로 화물추적, 스케줄, 운임 등.
- 키 발급: 불필요(조회는 로그인 없이 가능). 공식 개발자 API 포털 없음.
- 검증: curl 실호출: www.ekmtc.com 403, api.ekmtc.com 403 (Akamai Access Denied 실확인) — 브라우저에서만 동작.
- 적합성: 국내 근해선사 주력이라 TWL 물량 다수 예상. 다만 SPA+Akamai라 서버측 호출·iframe 불가 — 새 창 딥링크만 가능하고 번호 프리필 파라미터는 미확인.

## 장금상선 Sinokor e-Service 추적
- 제공: Sinokor (ebiz.sinokor.co.kr) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://ebiz.sinokor.co.kr/Tracking`
- 데이터: B/L 번호 기반 화물추적, 스케줄, 선박 위치(Map/VslFinder).
- 키 발급: 불필요(공개 조회 페이지). 공식 API 없음.
- 검증: curl·WebFetch 실호출 모두 HTTP 500(2026-07-28). 본사이트 www.sinokor.co.kr는 200.
- 적합성: 근해 물량 딥링크용. 단 조사 시점 서버가 HTTP 500 반환(일시 장애 추정, www.sinokor.co.kr 본사이트는 200 정상) — 연동 전 재확인 필요.

## HJNC(한진부산컨테이너터미널) 정보조회서비스
- 제공: HJNC (www.hjnc.co.kr) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `컨테이너 찾기: https://www.hjnc.co.kr/esvc/cntr/search / 반출입 목록: https://www.hjnc.co.kr/esvc/yard/gateInOutList / 위치조회: https://e-service.hjnc.co.kr/esvc/cntr/location`
- 데이터: 컨테이너 번호로 터미널 내 위치·상태, 반출입(게이트 인/아웃) 이력, 본선작업 현황, 양적하 예정시간.
- 키 발급: 불필요 — 로그인 없이 공개.
- 검증: curl 실호출 HTTP 200 확인(2026-07-28).
- 적합성: 부산신항 하역 건의 '터미널 반출입 상태' 보조 표시에 적합. 공개 HTML이라 딥링크 우선, 스크래핑은 약관 확인 후.

## PNIT(부산신항국제터미널) 정보서비스
- 제공: PNIT (www.pnitl.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://www.pnitl.com/infoservice/cntr/cntrSearchList.jsp`
- 데이터: 컨테이너 정보(반출입 상태·위치), 양하 예정시간, 야드 현황.
- 키 발급: 불필요 — 공개 조회.
- 검증: curl 실호출 HTTP 200 확인(2026-07-28).
- 적합성: PNIT 양하/적하 건 보조 정보용 딥링크.

## PNC(부산신항만주식회사) 정보조회서비스
- 제공: PNC (svc.pncport.com) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://svc.pncport.com/info/CMS/Container/Info.pnc?mCode=MN002`
- 데이터: 컨테이너 정보·반출입 현황 조회.
- 키 발급: 불필요 — 공개 조회.
- 검증: curl 실호출 HTTP 200 확인(2026-07-28).
- 적합성: PNC 처리 건 보조 정보용 딥링크.

## 기타 부산 터미널·통합 포털 (BNCT / HPNT / BPA 체인포털)
- 제공: BNCT(info.bnctkorea.com), HPNT(www.hpnt.co.kr), 부산항만공사 체인포털(www.chainportal.co.kr) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `BNCT: https://info.bnctkorea.com/esvc/ (200 확인) / HPNT: https://www.hpnt.co.kr/ (302 리다이렉트 존재 확인) / 체인포털: https://www.chainportal.co.kr/ (301 존재 확인)`
- 데이터: 터미널별 컨테이너 반출입·본선작업 현황. 체인포털은 부산항 전 터미널 통합 컨테이너 이력 조회 제공.
- 키 발급: 터미널 e-service는 대체로 로그인 없이 조회 가능. 체인포털(BPA 통합 물류정보)은 무료이나 회원가입 필요 여부 화면별 상이 — 추가 확인 필요.
- 검증: curl 실호출: BNCT 200, HPNT 302, 체인포털 301 (2026-07-28). 상세 화면 무가입 여부는 미검증.
- 적합성: 부킹 건의 하역 터미널이 제각각이므로, 터미널 코드→조회 URL 매핑 테이블을 만들어 딥링크로 연결하는 구조 권장.

## IMF PortWatch (ArcGIS REST)
- 제공: IMF (국제통화기금) + Oxford | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services/Daily_Ports_Data/FeatureServer/0/query (포트) / Daily_Chokepoints_Data (초크포인트)`
- 데이터: 전 세계 2,065개 항만의 일별 기항수(portcalls)·수입/수출 물동량 추정치(위성 AIS 기반, 매주 화요일 갱신), 28개 해협·운하(수에즈·파나마 등) 통과량. CSV/GeoJSON/WFS도 제공
- 키 발급: 불필요 — 공개 ArcGIS FeatureServer, where/outFields/f=json 쿼리만으로 호출
- 검증: 실호출 검증 완료: Busan 조회 시 {portname:Busan, country:Korea, portcalls, import, export} 일별 레코드 정상 반환(HTTP 200, 키 없이)
- 적합성: 중간~높음 — 부산·상하이 등 기항 항만의 혼잡도/기항 추이 위젯, 홍해·파나마 등 초크포인트 리스크 배너로 활용 적합. 개별 화물 추적은 아님

## UNCTADstat Data API (LSCI 등)
- 제공: UNCTAD (유엔무역개발회의) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://unctadstat-api.unctad.org/bulkdownload/US.LSCI_M/US_LSCI_M (벌크 CSV.gz) / https://unctadstat-api.unctad.org/api/reportMetadata/{보고서ID}`
- 데이터: 정기선 연결성 지수(LSCI) 월별/분기별, 항만별 PLSCI, 해상운송 통계. 국가·항만의 정기선 네트워크 연결성 수치
- 키 발급: 불필요
- 검증: 실호출 검증 완료: 벌크 다운로드 HTTP 200(209KB), 메타데이터 API 정상 응답, 데이터 최종갱신 2026-06-10 확인
- 적합성: 낮음~중간 — 실시간 추적용은 아니고 항로/항만 선택 참고 통계·대시보드 배경 데이터로 적합

## Fintraffic Digitraffic Marine (핀란드 해상교통)
- 제공: Fintraffic (핀란드 교통관리공사) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://meri.digitraffic.fi/api/ais/v1/locations, /api/ais/v1/vessels, /api/port-call/v1/port-calls (Accept-Encoding: gzip 헤더 필수)`
- 데이터: 발트해·핀란드 수역 실시간 AIS 위치+선박 메타데이터, 핀란드 항만 Port Call(입출항 신고) 데이터
- 키 발급: 불필요 — 키 없이 호출, MQTT/WebSocket 실시간 피드도 무료
- 검증: 실호출 검증 완료: /locations 전체 조회 시 993척 실시간 위치 GeoJSON 정상 수신(키 없이, gzip 필수 확인)
- 적합성: 낮음 — 커버리지가 발트해 한정이라 한국 포워더 화물 추적에는 직접 효용 적음. 다만 완전 무키·무제한에 가까운 공공 AIS API의 레퍼런스 구현으로 가치 있음

## NOAA MarineCadastre AIS (미국 연안 이력 데이터)
- 제공: NOAA/BOEM (미국) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://hub.marinecadastre.gov/pages/vesseltraffic (CSV/GDB 벌크 다운로드)`
- 데이터: 미국 수역 AIS 이력(선박별 위치·항적, 연·월 단위 벌크). 실시간 아님
- 키 발급: 불필요
- 검증: 실접속 HTTP 200 확인. 학술·분석용 표준 무료 데이터셋
- 적합성: 낮음 — 실시간 추적 불가. 항로 분석·ETA 모델 학습 등 백오피스 분석용

## 덴마크 해사청(DMA) AIS 이력 데이터
- 제공: Danish Maritime Authority | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `http://web.ais.dk/aisdata/ (일 단위 CSV 벌크)`
- 데이터: 덴마크 수역 AIS 이력 전량(일별 CSV). 학술 논문에서 가장 널리 쓰이는 무료 AIS 코퍼스 중 하나
- 키 발급: 불필요
- 검증: 실호출 실패(연결 불가) — 문서·논문 인용 근거. 필요 시 재시도 요
- 적합성: 낮음 — 이력·분석용. 이번 검증 시점에는 현 네트워크에서 접속 실패(000)하여 문서 근거로만 확인

## DCSA Track & Trace 표준 (참고)
- 제공: DCSA (디지털컨테이너해운협회) | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `https://dcsa.org/api-portal/ — 표준 스펙 문서 및 각 선사 개발자 포털 링크 허브`
- 데이터: Track & Trace 2.2 이벤트 스키마, Commercial Schedules 표준 — Maersk·MSC·CMA CGM·Hapag-Lloyd·ONE·HMM 채택
- 키 발급: 표준 스펙 자체는 무료 공개(OpenAPI). 실제 데이터는 각 선사 포털에서 키 발급
- 검증: DCSA 공식 API 포털에서 표준 공개 및 선사 포털 링크 확인
- 적합성: 높음(설계 관점) — cargo 화면의 이벤트 테이블·상태 모델을 DCSA T&T 스키마로 설계하면 이후 어떤 선사 API를 붙여도 무변경 수용 가능. 자체 조어 금지 원칙과도 부합하는 표준 용어 소스

## SP-IDC 해운항만물류정보센터 (spidc.go.kr)
- 제공: 해양수산부 | 범위: 해상 | 무료: 완전무료 | 키: 불필요
- 엔드포인트: `웹 포털(www.spidc.go.kr) — 별도 공개 오픈API 엔드포인트 없음`
- 데이터: PORT-MIS 기반 입출항·물동량·항만시설 통계, 해운항만물류 통합 조회
- 키 발급: 해당 없음(웹 조회). 데이터의 API 개방은 공공데이터포털 경유로 일원화되어 있음
- 검증: 검색·문서 근거: SP-IDC 자체 오픈API 문서 부재, 개방 데이터는 data.go.kr로 제공됨 확인
- 적합성: 직접 연동 불가(공개 API 없음). 필요 데이터는 위 data.go.kr 해수부 API로 대체하는 것이 맞음

## 관세청 UNIPASS 오픈API (화물통관진행정보 외 50여 종)
- 제공: 관세청 (UNIPASS, unipass.customs.go.kr) | 범위: 공통 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://unipass.customs.go.kr:38010/ext/rest/cargCsclPrgsInfoQry/retrieveCargCsclPrgsInfo?crkyCn={인증키}&cargMtNo={화물관리번호} 또는 &mblNo=/&hblNo=+&blYy= (API별로 /ext/rest/{서비스ID}/{오퍼레이션} 구조)`
- 데이터: 화물통관진행정보: 화물관리번호·MBL·HBL(+B/L연도)로 수입화물의 통관 진행 상태(하선→보세운송→반입→수입신고→수리 등 이벤트 타임라인), 선박국적, 선사/항공사, 적재항, 포장개수 등. 3년 이내 데이터 조회 가능. 그 외 수출이행내역(API002), 수입신고 개인통관고유부호 검증, HS부호·관세율, 관세환율 등
- 키 발급: UNIPASS 회원가입 → My메뉴 → [서비스 관리] → [OpenAPI 사용관리]에서 필요한 API 선택 후 신청하면 즉시 승인되어 인증키 발급(심사 없음, API별 개별 키). 호출 한도는 문서상 별도 명시 없음. 오픈API는 2015년 19종→2019년 30종→2022년 42종→2023년 54종으로 확대
- 검증: 실호출 검증 완료: 무키 호출 시 XML로 '존재하지 않는 인증키입니다'(tCnt=-1) 정상 응답 → 엔드포인트 가동 확인 (2026-07 기준). data.go.kr 등재 페이지(15126268)도 UNIPASS 신청 경로 안내 확인
- 적합성: 핵심 1순위. MBL/HBL 단위 추적 화면의 근간이며 해상·항공 공통(AWB도 HBL 필드로 조회). 국내 공공 API 중 유일하게 B/L 번호 단위 이벤트 추적 제공

## 관세청_수출이행내역 (data.go.kr 15126269 / UNIPASS API002)
- 제공: 관세청 | 범위: 공통 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `UNIPASS /ext/rest 계열 (수출신고번호 기반 조회)`
- 데이터: 수출신고번호별 수리일자, 출항(선적)일자, 적재의무기한, 선적중량/통관중량 잔량 등 수출이행 내역
- 키 발급: 위 UNIPASS OpenAPI 사용관리에서 동일하게 즉시 발급
- 검증: data.go.kr 15126269 및 UNIPASS 라이브러리(bandoche/unipass, API002 구현) 문서 근거. 실호출은 키 필요
- 적합성: 수출 건 화면 보강용. 수출신고 수리 후 선적 이행 여부(적재 잔량) 표시에 적합

## DHL Shipment Tracking – Unified API (+ DGF ACTIVETracing 웹)
- 제공: DHL Group (developer.dhl.com) | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `GET https://api-eu.dhl.com/track/shipments?trackingNumber={번호} (헤더 DHL-API-Key). 보조: DHL Global Forwarding 항공화물(MAWB/하우스빌)은 https://activetracing.dhl.com 공개 웹 조회 무료`
- 데이터: DHL 전 사업부 통합 추적: Express, Global Forwarding(항공/해상), eCommerce, Freight, Post&Parcel. 이벤트 타임라인 JSON
- 키 발급: developer.dhl.com 무료 가입 → 앱 등록 → 승인 후 키 발급(회사 프로필 검증 있음). 초기 한도 1일 250콜, 5초당 1콜 — 상향은 별도 신청
- 검증: developer.dhl.com 공식 문서로 확인(엔드포인트, DHL-API-Key 헤더, 250콜/일 초기 한도, 무료 등록). 키 미보유로 실호출은 미실시
- 적합성: DHL 익스프레스 건과 DGF 경유 항공화물 추적에 적합. 250콜/일이면 사내 포털 조회량엔 개발~소규모 운영까지 충분. 공식 API라 안정성 높음

## FedEx Track API
- 제공: FedEx (developer.fedex.com) | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `POST https://apis.fedex.com/track/v1/trackingnumbers (OAuth2 client_credentials 토큰). AWB 프리픽스 023 포함 FedEx 운송장 번호로 조회`
- 데이터: FedEx Express/Freight 스캔 이벤트 전체 타임라인, 예상 인도일, POD 요약
- 키 발급: developer.fedex.com 계정 무료 개설 → 프로젝트 생성 → API Key/Secret 즉시 발급. Track API 자체는 무료. 주의: 별도 상품인 'Basic/Enhanced Integrated Visibility'(FedEx 미고객용 구독형)는 30일 무료체험 후 월과금 — 혼동 금지
- 검증: developer.fedex.com 공식 문서·FAQ·Pricing Guide로 확인(계정·API 무료, Integrated Visibility만 구독제). 키 미보유로 실호출 미실시
- 적합성: 특송(쿠리어) 건 및 FedEx 항공(023) 건 추적용. 공식 API + 무료라 특송 탭에 바로 연동 권장

## UPS Track API (Track — OAuth)
- 제공: UPS (developer.ups.com) | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `GET https://onlinetools.ups.com/api/track/v1/details/{trackingNumber} (OAuth2). UPS Air Cargo(프리픽스 406) 순수 항공화물은 별도로 ups.com Air Cargo 공개 웹 조회`
- 데이터: UPS 소포·화물 스캔 이벤트, 배송 상태, 예상 인도일
- 키 발급: developer.ups.com 무료 가입 → 앱 생성 → Client ID/Secret 발급. Track API는 라이선스 무료
- 검증: developer.ups.com 및 UPS Developer Kit FAQ 문서로 무료 확인. 키 미보유로 실호출 미실시
- 적합성: 특송 건 추적용으로 적합. 406 MAWB(UPS Airlines) 전용 API는 없으므로 그 경우 웹 딥링크 폴백

## 인천국제공항공사 화물편 운항현황 오픈API
- 제공: 인천국제공항공사 / 공공데이터포털 data.go.kr (활용신청 15095068) | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/B551177/StatusOfCargoFlights/getCargoArrivals (·getCargoDepartures), 파라미터: serviceKey, airline(IATA), flight_id, from_time/to_time, airport, lang(K/E/C/J), type=json`
- 데이터: 인천공항 화물기 편별 운항현황: 항공사, 편명, 예정/변경 시각, 출발지, 현황(도착/지연/결항/회항/착륙), 화물터미널(남측/북측/제2화물터미널). AWB 단위 아님 — 항공편 단위
- 키 발급: data.go.kr 무료 회원가입 → 활용신청 즉시 자동승인. 개발계정 1일 1,000트래픽, 운영계정 신청 시 대폭 상향(무료)
- 검증: data.go.kr 공식 명세 페이지로 확인(엔드포인트·파라미터·트래픽 한도). UNIPASS처럼 키 신청 필요하나 자동승인이라 즉시 사용 가능
- 적합성: AWB 추적에서 얻은 탑재편(예: KE0904)의 실제 도착/지연 여부를 보강 표시하는 용도로 유용. 'MAWB→탑재편→편 운항현황' 2단 결합 시 화면 가치 큼. 공식 공공 API라 안정적

## 인천국제공항공사_화물편 운항현황(다국어)
- 제공: 인천국제공항공사 | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/B551177/StatusOfCargoFlights/getCargoArrivals (및 getCargoDepartures)?serviceKey={키}&flight_id=&airline=&from_time=&to_time=&lang=K&type=json`
- 데이터: 화물편의 항공사, 편명, 예정/변경시간, 출발공항(코드), 탑승구, 운항현황(도착·결항·지연·회항·착륙), 화물터미널 구분(C01 남측/C02 북측/C03 제2화물터미널)
- 키 발급: 공공데이터포털 활용신청, 개발/운영 모두 자동승인. 트래픽: 개발계정 1,000/일, 운영계정 활용사례 등록 시 증액
- 검증: 실호출 검증: 무키 호출 시 'Unauthorized' 응답으로 엔드포인트 가동 확인, data.go.kr 15095068에서 파라미터·응답 항목 확인
- 적합성: AWB의 편명(플라이트) 기준 도착/지연 상태 표시에 적합. AWB 번호 단위 추적 공공 API는 국내에 없으므로 'UNIPASS 통관진행 + 편명 운항현황' 조합이 항공 추적의 현실적 구성

## 인천국제공항공사_화물기 운항 현황 상세 조회 서비스
- 제공: 인천국제공항공사 | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/B551177/StatusOfCargoFlightsDeOdp/getCargoArrivalsDeOdp (및 getCargoDeparturesDeOdp)`
- 데이터: 화물기 D-3~+6일 범위의 항공사, 출/도착 공항명·코드, 코드쉐어, 편명 UNIQ코드, 마스터편명, 탑승구, 운항현황, 예정/변경일자, 터미널 구분, 기종
- 키 발급: 공공데이터포털 활용신청. 개발단계 자동승인(500/일), 운영단계는 심의승인(100,000/일, 활용사례 등록 시 증액)
- 검증: 실호출 검증: 무키 호출 시 'Unauthorized' 응답 확인, data.go.kr 15113461 swagger에서 host·오퍼레이션명 추출 확인
- 적합성: 미래 스케줄(+6일)까지 제공되어 ETA 예고 표시에 적합. 단 운영 전환 시 심의승인 필요한 점 유의

## 국토교통부_(TAGO)_국내항공운항정보
- 제공: 국토교통부 (TAGO) | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/1613000/DmstcFlightNvgInfo/GetFlightOpratInfoList (외 GetArprtList, GetAirmanList)`
- 데이터: 국내선 출발/도착 공항, 항공사, 편명, 출발·도착 예정시각, 운임 등 국내 항공 운항 스케줄
- 키 발급: 공공데이터포털 활용신청(자동승인 계열, 개발계정 일 한도 후 운영 증액)
- 검증: 실호출 검증: 무키 호출 시 'Unauthorized' 응답으로 엔드포인트 가동 확인, data.go.kr 15098526 swagger에서 host·오퍼레이션 확인
- 적합성: 국내선 구간(김포-제주 등) 항공편 스케줄 보조용. 국제 화물 추적과는 거리가 있어 우선순위 낮음

## 한국공항공사 Open API (항공기 운항정보 등)
- 제공: 한국공항공사 (KAC) | 범위: 항공 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `공공데이터포털 경유 신청 후 발급되는 KAC 운항정보 API (공항코드, 국내/국제 스케줄, 실시간 운항현황)`
- 데이터: 전국 지방공항(김포·김해·제주 등) 항공기 이착륙 정보: 항공사, 편명, 예정/변경시각, 출발지, 도착지. 화물 전용 API는 없고 수송실적 '통계'만 별도 제공
- 키 발급: KAC 공식 안내상 모든 Open API는 data.go.kr 통해 신청, 무료
- 검증: KAC 공식 Open API 안내 페이지(airport.co.kr MENU_ID=1270) 문서 근거. 구 data.go.kr 상세페이지(15000126)는 개편으로 확인 불가 — 연동 시 data.go.kr에서 현행 등재본 재검색 필요
- 적합성: 인천 외 지방공항 발착 화물편의 편명 기준 상태 확인 보조용. AWB 단위 추적 불가

## Maersk Track & Trace API (Track and Trace Plus / MEC Tracking)
- 제공: Maersk (developer.maersk.com) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://developer.maersk.com/api-catalogue/Track%20and%20Trace%20Plus (게이트웨이: api.maersk.com)`
- 데이터: 컨테이너 번호/B/L 번호 기준 마일스톤 이벤트 전체 이력(DCSA Track & Trace v2.2 준거), ETA, 선박/항차, 위치. Maersk·Sealand·Hamburg Süd 커버.
- 키 발급: developer.maersk.com에서 셀프서비스 회원가입 → 앱 생성 → Consumer Key(API키) 즉시 발급. 영업담당 접촉 불필요, 샌드박스 무료 제공. 프로덕션 전환 시 앱 승인 절차만 거침.
- 검증: 검색 결과 다수로 셀프서비스 무료 등록 확인(개발자 포털 직접 curl은 봇차단 502·ECONNRESET — 브라우저 가입 필요). 실키 발급 후 실호출 검증 권장.
- 적합성: Maersk 계열 부킹 건의 MBL·컨테이너 추적에 최적. DCSA 표준 이벤트라 타임라인 UI에 바로 매핑 가능. 무료 API 실존 선사 1순위.

## Hapag-Lloyd Track & Trace API (DCSA v2.2.4)
- 제공: Hapag-Lloyd (api-portal.hlag.com) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://api-portal.hlag.com/ (문서: https://doc.api-portal.hlag.com/02.products/track-and-trace/)`
- 데이터: Hapag-Lloyd 부킹 건의 Shipment/Equipment/Transport 이벤트(DCSA T&T v2.2.4 — 2026년 초 기준 선사 중 최신 DCSA 구현).
- 키 발급: api-portal.hlag.com 셀프서비스 가입 → 구독 신청 → 키 발급. 샌드박스 제공, 영업담당 불필요.
- 검증: 공식 문서 사이트(doc.api-portal.hlag.com) 검색 결과로 확인. BETA 상태 유의.
- 적합성: HL 물량이 있다면 컨테이너 이벤트 타임라인에 바로 사용 가능. 단 공식 문서상 BETA 라벨 — 웹사이트 데이터와 교차검증 권고 문구 있음.

## ZIM Public API (Tracking 포함)
- 제공: ZIM (zim.com) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://www.zim.com/contact-us/zim-api-support (약관: zim.com/help/api-terms-and-conditions)`
- 데이터: ZIM 선적 건 추적(컨테이너/B/L), 스케줄 등 공개 API 세트.
- 키 발급: ZIM 공식 문구상 'Public API는 무료(free of charge)'. 조직 단위로 API Token 신청·발급(신청서 승인제), OAuth 2.0 Client Credentials 인증. 신청 창구: https://www.zim.com/contact-us/zim-api-support
- 검증: ZIM 공식 API 지원 페이지·약관 검색 결과로 무료 명시 확인. 실호출은 토큰 발급 후 가능.
- 적합성: ZIM 물량이 있는 경우에만 유효. 무료지만 토큰 신청 승인 대기 필요.

## HMM API Portal — Track and Trace (DCSA) v1
- 제공: HMM (apiportal.hmm21.com) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://apiportal.hmm21.com/api (API 갤러리 실페이지 확인)`
- 데이터: Track and Trace (DCSA) v1, Vessel Schedule, Port-to-Port Schedule(시간당 300콜 제한 명시), By Calling Port Schedule, DCSA Arrival Notice, DCSA Booking v2 — 총 6개 API 실재 확인.
- 키 발급: apiportal.hmm21.com 회원가입(사업자번호 필요, 기업회원) → HMM 심사·승인 → ID/키 발급. 약관에 '일부 서비스는 이용요금 부과 가능' 조항이 있으나 기본 Open API 플랫폼은 무료 취지. HMM 서비스 이용 기업(고객사) 대상.
- 검증: WebFetch 실호출로 포털 소개·API 갤러리 6종 목록 직접 확인(2026-07-28). 키 발급은 승인제라 미실행.
- 적합성: 국적선사 중 유일한 공식 API 포털. 태웅로직스의 HMM 부킹 물량 추적에 최우선 연동 후보. DCSA 표준이라 Maersk/HL과 동일 스키마로 통합 가능.

## AISStream.io 실시간 AIS 웹소켓
- 제공: AISStream.io (커뮤니티 수신국 네트워크) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `wss://stream.aisstream.io/v0/stream (문서: https://aisstream.io/documentation)`
- 데이터: 전 세계 지상국 기반 실시간 AIS: 선박 위치(위경도·SOG·COG·heading), 정적정보(선명·IMO·목적지·ETA). MMSI 목록·바운딩박스·메시지타입 필터 구독 가능
- 키 발급: aisstream.io에서 GitHub 등으로 로그인 후 API 키 즉시 발급(무료, 승인 절차 없음)
- 검증: 공식 문서·GitHub(aisstream/example) 2026년 현재 운영 확인. 구독 메시지를 웹소켓 생성 후 3초 내 전송해야 하는 제약 문서로 확인. 키 등록이 필요해 실호출은 미수행
- 적합성: 높음 — MBL에 매핑된 모선(Vessel) MMSI/IMO로 실시간 위치를 지도에 표시하는 용도로 현존 최선의 무료 수단. 단 지상국 AIS라 대양 한가운데는 공백 구간 발생, 컨테이너 단위 추적은 불가. 웹소켓이므로 서버측 수집기(Edge Function/워커)로 받아 DB에 적재 후 화면에 서빙하는 구조 권장

## BarentsWatch Live AIS API
- 제공: 노르웨이 연안청(Kystverket)/BarentsWatch | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://live.ais.barentswatch.no (OpenAPI: developer.barentswatch.no/docs/AIS/live-ais-api)`
- 데이터: 노르웨이 EEZ·스발바르 수역 실시간 AIS 스트림/REST
- 키 발급: barentswatch.no 무료 가입 후 MyPage에서 API 클라이언트 생성(OAuth2/OpenID Connect). NLOD 오픈라이선스
- 검증: 공식 개발자 문서로 무료·등록제·수역 범위 확인(2026년 현재 운영)
- 적합성: 낮음 — 노르웨이 수역 한정. 북유럽 항로 화물이 있을 때만 보조적 가치

## Maersk Developer Portal (Track & Trace / Vessel Schedules)
- 제공: A.P. Moller-Maersk | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://developer.maersk.com — Track & Trace(컨테이너/BL 마일스톤), Vessel Schedules, Point-to-Point 등`
- 데이터: Maersk(+Hamburg Süd·Sealand) 운송건의 컨테이너·BL 단위 이벤트, 본선 스케줄, 구간 스케줄
- 키 발급: 포털 무료 가입 → 앱 생성 → Consumer Key 셀프 발급, 샌드박스 제공. 일부 프로덕션 API는 고객/파트너 관계 확인 절차 있음
- 검증: 포털 셀프서비스 5단계 등록 흐름을 공식 FAQ(maersk.com/support/faqs/how-to-start-with-api, HTTP 200 실접속)로 확인
- 적합성: 높음 — Maersk 선적건에 한해 MBL/컨테이너 번호로 무료 추적 API 직결 가능. 캐리어별 어댑터 패턴으로 cargo 화면에 붙이기 가장 좋은 무료 경로

## Hapag-Lloyd API Portal (Track & Trace)
- 제공: Hapag-Lloyd | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://api-portal.hlag.com (베타, DCSA T&T 기반)`
- 데이터: HL 운송건 shipment/equipment/transport 이벤트. 단 실시간 GPS 위치(Live Position)는 Merchant Haulage 기준 컨테이너당 $15 유료
- 키 발급: 포털 셀프 가입·샌드박스 무료. 브라우저 외 접근은 403이라 가입 후 키 필요
- 검증: 포털 존재 확인(직접 curl 403 = 게이트 확인), 베타 상태·Live Position 과금은 문서 근거
- 적합성: 중간~높음 — HL 선적건 이벤트 추적 무료 연동 가능(베타 주의, 포털 대비 이벤트 누락 가능성 문서화됨)

## CMA CGM API Portal (Track & Trace)
- 제공: CMA CGM | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://api-portal.cma-cgm.com/products/api/operation.trackandtrace.v1`
- 데이터: CMA CGM 운송건 장비 이동 이벤트, 본선 출도착 예정일 (DCSA 이벤트 구조)
- 키 발급: 셀프서비스 포털 가입 → API 키 발급, 샌드박스 제공(public connection 등급)
- 검증: 공식 API 포털 제품 카탈로그 페이지로 확인(셀프서비스·공개 연결 등급 명시)
- 적합성: 중간~높음 — CMA CGM 선적건 한정 무료 추적 어댑터로 적합

## HMM API Portal
- 제공: HMM | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `https://apiportal.hmm21.com (Swagger/OpenAPI, POST 기반, DCSA 표준 지향)`
- 데이터: HMM 운송건 추적·스케줄 등 4종+ API (2022 개시, DCSA 표준 순차 확대)
- 키 발급: 포털 가입 후 사용 신청(승인제). 스케줄 API 시간당 300콜 제한
- 검증: hmm21.com 공식 디지털 인터페이스 페이지 및 API 포털 운영 확인(문서 근거)
- 적합성: 높음 — 국적선사라 태웅로직스 물량 비중이 클 가능성이 높고 포털이 한국어. HMM 선적건 어댑터 1순위 후보

## 해양수산부_선박운항정보 (PORT-MIS 선박 입출항)
- 제공: 해양수산부 (PORT-MIS) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/1192000/VsslEtrynd5/Info5?serviceKey={키}&... (GET, XML) — 항구·조회기간·호출부호(clsgn) 파라미터`
- 데이터: 항구청코드/명, 입항년도·입항횟수, 호출부호, 선박명, 선박국가, 선박종류, 총톤수, 입출항 일시, 출항지, 차항지 등 전국 무역항 입출항 실적(실시간 갱신 표기)
- 키 발급: 공공데이터포털(data.go.kr) 회원가입 → 활용신청. 개발단계/운영단계 모두 자동승인(즉시). 트래픽: 개발계정 10,000/일, 운영계정은 활용사례 등록 시 증액 신청 가능
- 검증: 실호출 검증: data.go.kr 페이지 swagger에서 오퍼레이션 Info5·응답 스키마(prtAgCd, clsgn, vsslNm 등) 확인, 무키 호출 시 'Unauthorized' 응답으로 엔드포인트 가동 확인
- 적합성: 선박(모선) 단위 ATA/ATD 확인용. B/L의 모선명·호출부호와 매칭하여 '본선 입항 완료/출항' 상태 표시에 적합. 컨테이너 단위 아님

## 해양수산부_내항컨테이너반출입정보
- 제공: 해양수산부 | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/1192000/CargContnIn2/Info?serviceKey={키}`
- 데이터: 항만명, 호출부호, 입항횟수, 수출입구분, 컨테이너번호/규격, 반출입지, 선하증권(B/L)번호, TEU
- 키 발급: 공공데이터포털 활용신청, 개발/운영 모두 자동승인. 개발계정 10,000/일
- 검증: 실호출 검증: 무키 호출 시 'Unauthorized' 응답으로 엔드포인트 가동 확인, 페이지 HTML에서 엔드포인트 추출 확인
- 적합성: 내항(연안) 컨테이너 한정이라 국제 포워딩 추적에는 보조적. 다만 B/L번호·컨테이너번호 필드가 있어 연안 피더 구간 확인엔 활용 가능

## 해양수산부_외항화물반출입정보
- 제공: 해양수산부 | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `http://apis.data.go.kr/1192000/CargFrghtOut4 (항만청코드·호출부호·입항연도 파라미터)`
- 데이터: 항만명, 입항년도, 화물품목, 해외지역, 반출입구분, 수출입국가(OD), 운임톤 — 통계성 데이터
- 키 발급: 공공데이터포털 활용신청, 개발/운영 모두 자동승인. 개발계정 10,000/일
- 검증: 무키 호출 시 게이트웨이 오류 응답으로 경로 존재 확인, 페이지 HTML에서 서비스ID 추출
- 적합성: 개별 화물 추적에는 부적합(통계·집계 성격). 대시보드의 항만 물동량 위젯 정도에 활용 가능

## 해양수산부 PORT-MIS 파일데이터 자동변환 API군 (선박입항신고 15128161, 선박관제정보 15128156, 선박입출항현황 15083024 등)
- 제공: 해양수산부 (해운항만물류정보시스템) | 범위: 해상 | 무료: 무료키발급 | 키: 필요
- 엔드포인트: `data.go.kr 파일데이터의 자동변환 오픈API(uddi 기반 REST, JSON/XML) — 각 데이터셋 페이지에서 확인`
- 데이터: 입항 선박 기본정보, 입항시간, 계선장소, 전출항지(입항신고), 선박관제(VTS) 입출항 기록 등. 갱신 주기가 월~반기 단위
- 키 발급: 공공데이터포털 활용신청 즉시 사용(파일데이터 자동변환 API는 자동승인)
- 검증: data.go.kr 데이터셋 존재 및 자동변환 API 제공 방식 문서 근거(공공데이터활용지원센터 3단계 이상 오픈포맷 자동변환 정책)
- 적합성: 갱신 주기가 길어 실시간 추적에는 부적합. 이력 조회·통계 보강용

## CargoAi (CargoMART / Track & Trace API)
- 제공: CargoAi | 범위: 항공 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `CargoMART 웹(포워더 가입) / CargoCONNECT Track&Trace API`
- 데이터: 100+ 항공사 AWB 마일스톤 추적, 예측 ETA, 부킹·요율 연계
- 키 발급: 포워더는 CargoMART 가입 무료 — 자사 부킹 건 추적은 웹에서 무료. 그러나 Track & Trace API는 AWB 구독당 US$1 과금
- 검증: CargoAi 공식 헬프센터 문서 'Track & Trace API Pricing Model' — AWB 구독당 $1 명시
- 적합성: 웹 무료분은 사람 손 조회용이고, 포털 연동(API)은 건당 과금이라 '무료 수단' 조건 미충족. API 연동은 무료아님으로 분류

## CMA CGM API Portal — Visibility/Tracking API
- 제공: CMA CGM (api-portal.cma-cgm.com) | 범위: 해상 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `https://api-portal.cma-cgm.com/products/visibility`
- 데이터: 컨테이너 이동 마일스톤(equipment moves), 환적 이벤트, 선박 예정일(DCSA T&T v2.2.0 스펙 게시).
- 키 발급: api-portal.cma-cgm.com 가입 후 상품(Offer) 구독. Public 티어는 API키 발급 + 무료 트라이얼 방식, Private 티어(철송·내륙 이벤트 등 상세)는 OAuth2 + 운송당사자(booking party) 검증 필요. 지속 사용은 상용 구독(Commercial Offer) 체계.
- 검증: 검색 결과로 2티어 구조 확인. 포털 직접 fetch는 503(봇차단). 트라이얼 조건은 가입 후 확인 필요.
- 적합성: CMA CGM 건 추적 가능하나 완전 무료 지속 사용은 불투명(트라이얼 후 상용). 딥링크 대안 병행 권장.

## AISHub 데이터 교환 API
- 제공: AISHub (Astra Paging) | 범위: 해상 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `https://www.aishub.net/api (XML/JSON/CSV, 1분당 1회 폴링 제한)`
- 데이터: 전 세계 기여자 네트워크 취합 AIS 위치 데이터
- 키 발급: 자체 AIS 수신기의 raw NMEA 피드를 UDP로 AISHub에 상시 기여해야 API 자격 부여(aishub@astrapaging.com 신청)
- 검증: 공식 join-us 페이지에서 기여 필수 조건·폴링 제한 확인
- 적합성: 낮음 — 사옥/터미널에 AIS 수신기를 설치·운영해야 하는 전제조건이 있어 포털 연동 수단으로는 비현실적. 수신기(수만원대 RTL-SDR) 설치를 감수하면 전 세계 데이터 무료 확보 가능

## Global Fishing Watch API
- 제공: Global Fishing Watch | 범위: 해상 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `https://globalfishingwatch.org/our-apis/documentation`
- 데이터: 선박 식별·항적·조업활동·항만방문 이벤트(AIS 기반)
- 키 발급: 무료 셀프 등록으로 토큰 발급 — 단 비상업 용도 한정
- 검증: 공식 FAQ에서 '상업 목적 사용 불가, 상업 라이선스 일반 제공 없음' 확인
- 적합성: 부적합 — 라이선스가 비상업 한정이라 태웅로직스 상용 포털 편입 불가(상업 라이선스는 개별 협의제로 일반 공개 요율 없음). FAQ에 명시됨

## MSC Developer Portal
- 제공: MSC | 범위: 해상 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `https://developerportal.msc.com (DCSA T&T 1.2/2.2, Commercial Schedules API 채택)`
- 데이터: MSC 운송건 DCSA 이벤트, 상업 스케줄
- 키 발급: 문서는 공개이나 크리덴셜은 셀프서비스가 아니라 MSC 영업팀 경유, 볼륨·범위에 따라 유료 가능
- 검증: MSC 공식 블로그(DCSA Commercial Schedules 채택) 및 서드파티 연동 가이드로 확인
- 적합성: 낮음~중간 — 무료 보장이 없어 후순위. MSC 물량이 크면 영업 채널로 협의

## APM Terminals API Store
- 제공: APM Terminals (Maersk 계열 터미널 운영사) | 범위: 해상 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `https://developer.apmterminals.com — Terminal Vessel Schedule, Container Event History, Import Availability`
- 데이터: APM 운영 터미널의 본선 입출항 일정(과거 7일~향후 14일), 터미널 내 컨테이너 이벤트, 반출 가능 상태·홀드
- 키 발급: 무료 계정 생성으로 키 발급, 전 API 90일 무료 체험(구독료·자동갱신 없음), 이후 유료 전환 추정
- 검증: 개발자 포털 실페이지 fetch로 무료 등록·90일 체험 조건 확인
- 적합성: 중간 — APM 터미널 경유 화물의 터미널 단계 가시성 보강용. 체험 기간으로 PoC 후 판단

## UN Global Platform AIS / 학술 데이터셋(AISdb 등)
- 제공: UN Big Data Platform, Dalhousie MERIDIAN 등 | 범위: 해상 | 무료: 부분무료 | 키: 필요
- 엔드포인트: `UN Global Platform은 공식통계·연구기관 한정 신청제, AISdb(MERIDIAN)는 학술용`
- 데이터: 전 지구 위성+지상 AIS (연구 목적)
- 키 발급: 기관 자격 심사 필요 — 민간 상용 포털은 대상 아님
- 검증: 각 기관 공개 정책 문서 근거
- 적합성: 부적합 — 상용 서비스 편입 불가. '학술 공개 = 상용 가용'이 아님을 확인

## 부산항만공사(BPA) — data.go.kr 오픈API 및 BPA-NET/체인포털
- 제공: 부산항만공사 | 범위: 해상 | 무료: 부분무료 | 키: 불필요
- 엔드포인트: `data.go.kr BPA 오픈API 현재 0건. BPA-NET(www.bpa-net.com), 체인포털(www.chainportal.co.kr)은 웹 포털. 터미널별 조회: BPT info.bptc.co.kr, PNC svc.pncport.com 등`
- 데이터: BPA-NET: 실시간 컨테이너 반출입, 본선작업, 도착선박 위치. 각 터미널 정보조회서비스: 컨테이너 단위 반출입·본선작업 조회
- 키 발급: BPA-NET·체인포털은 무료 회원가입 후 웹 조회 가능하나 공개 REST API가 아님(시스템 연계는 별도 협약 필요)
- 검증: 실검증: data.go.kr 부산항만공사 오픈API 검색 결과 '0건' 확인, 구 본선작업현황정보(15085016) 페이지 404(폐기) 확인 (2026-07 기준)
- 적합성: 컨테이너 번호 단위 데이터로는 가장 좋으나 공개 API가 없어 포털 직접 연동 불가. 필요 시 BPA-NET 연계 협약 검토 대상. 화면에는 터미널 조회 딥링크 버튼 제공이 현실적 대안

## CHAMP Traxon cargoHUB / Traxon Premium Tracking API
- 제공: CHAMP Cargosystems | 범위: 항공 | 무료: 무료아님 | 키: 필요
- 엔드포인트: `champ.aero 상품 페이지 (가격 문의제)`
- 데이터: 100+ 항공사 AWB 마일스톤(FWB 발행자가 아니어도 추적 가능)
- 키 발급: 영업 접촉 필요, 가격 비공개
- 검증: 공식 사이트에 'pricing on demand' 표기
- 적합성: 유료 전용 — 상세 조사 생략. 무료 대안은 위의 track.champ.aero 공개 페이지

## MSC Developer Portal / Integration Suite
- 제공: MSC (developerportal.msc.com) | 범위: 해상 | 무료: 무료아님 | 키: 필요
- 엔드포인트: `https://developerportal.msc.com/ (문서 열람은 공개)`
- 데이터: DCSA 기반 Track & Trace, 스케줄 등 — 문서·샘플은 포털에서 공개 열람 가능.
- 키 발급: 셀프서비스 키 발급 불가. 영업담당 통한 고객 온보딩 완료 후에만 UAT/프로덕션 자격증명 제공(온보딩 후 이용 자체는 무과금, 일 10만콜·초당 4콜 제한).
- 검증: curl 실호출: msc.com 추적 내부 API 403(봇차단) 확인. 포털 접근모델은 검색 결과 근거.
- 적합성: 즉시 연동 불가(영업 경유). 대신 웹 딥링크 https://www.msc.com/en/track-a-shipment?trackingNumber={번호} 를 새 창 연결로 사용 권장(공개 추적 페이지는 무료·로그인 불필요, 단 API성 직접 호출은 봇차단 — curl 실호출 403 확인).

## 상용 컨테이너 추적 애그리게이터 일괄 (Vizion, Terminal49, project44, MarineTraffic API, SeaRates, ShipsGo, JSONCargo, Datalastic, VesselFinder, MyShipTracking, Sinay, TrackingMore, NavAPI 등)
- 제공: 각 사 | 범위: 해상 | 무료: 무료아님 | 키: 필요
- 엔드포인트: `—`
- 데이터: 멀티 캐리어 컨테이너 단위 추적, 예측 ETA
- 키 발급: 유료 계약 (ShipsGo는 가입 시 3~5크레딧, NavAPI는 트라이얼 키 등 명목상 체험만 존재)
- 검증: 각 사 요금 페이지·문서 근거로 유료 확인(지시에 따라 상세 조사 생략)
- 적합성: 결론: 2026년 7월 현재 '멀티 캐리어 컨테이너 단위 추적'을 무료로 제공하는 API는 존재하지 않음을 검증함. 무료 경로는 (1) 캐리어별 자체 무료 API(Maersk·Hapag-Lloyd·CMA CGM 셀프서비스, HMM 신청제 — DCSA 표준이라 어댑터 스키마 통일 가능), (2) 터미널 API(APM 90일 체험), (3) 선박 단위는 AISStream 무료 웹소켓으로 대체하는 3단 구성이 현실적 최선

# 구현 우선순위 (종합)

## 1) 지금 즉시 (키 없이)
- **DCSA Track & Trace 표준 스키마 채택 (해상·설계 기반)** — cargo 화면의 이벤트 테이블·상태 모델을 DCSA T&T 2.2 스키마(Shipment/Equipment/Transport 이벤트)로 먼저 설계해, 이후 HMM·Maersk·HL 등 어떤 선사 API를 붙여도 무변경 수용 — 표준 용어 사용 원칙에도 부합
- **IMF PortWatch ArcGIS REST (해상)** — 키 없이 Daily_Ports_Data/Daily_Chokepoints_Data FeatureServer를 where/f=json 쿼리로 서버측 배치 호출해 부산 등 기항 항만 혼잡도 위젯과 수에즈·파나마 초크포인트 리스크 배너 구현 (실호출 200 검증됨, 주 1회 갱신 캐시)
- **UNCTADstat LSCI (해상·통계)** — 월별 벌크 CSV.gz를 배치 다운로드해 항로·항만 연결성(LSCI/PLSCI) 대시보드 배경 통계로 표출 (실시간 추적 아님, 후순위 위젯)
- **대한항공 카고 AWB 추적 내부 JSON API (항공·비공식)** — 서버 프록시(Edge Function)에서 GET /en/tracking으로 GUEST JWT+SSESS 쿠키 획득 → POST /cargoportal/services/trackawb 2단계 호출로 180-프리픽스 MAWB 마일스톤·편명·통관상태를 타임라인에 표출, 비공식이므로 어댑터 계층으로 격리 + AWB mod7 체크디짓 입력검증 적용 (2026-07-28 실호출 성공)
- **아시아나 카고 AWB 추적 JSON 엔드포인트 (항공·비공식)** — 서버 프록시에서 viewTraceAirWaybill.do GET으로 세션+_csrf 확보 → searchTraceAirWaybillResult.do POST로 988-프리픽스 MAWB의 RCS/DEP/NFD/DLV 마일스톤 JSON을 진행단계 바(수출반입→출발→도착통지→인도)에 그대로 매핑, 어댑터 격리 (실데이터 호출 검증됨)

## 2) 무료 키 발급 후
- **관세청 UNIPASS 화물통관진행정보 (공통·핵심 1순위)** — MBL/HBL(+B/L연도)·화물관리번호로 통관 이벤트 타임라인(하선→보세운송→반입→수입신고→수리)을 cargo 화면의 기본 추적 소스로 구현 — 해상·항공(AWB=HBL 필드) 공통
  - 키 발급: UNIPASS(unipass.customs.go.kr) 회원가입 → My메뉴 → 서비스 관리 → OpenAPI 사용관리에서 필요한 API 선택 신청 → 심사 없이 즉시 승인, API별 개별 인증키 발급
- **관세청 수출이행내역 API002 (공통)** — 수출 건 화면에 수출신고번호 기준 수리일자·출항일자·적재의무기한·선적 잔량을 표시해 선적 이행 여부 보강
  - 키 발급: 위 UNIPASS OpenAPI 사용관리에서 동일하게 즉시 발급 (API별 개별 키)
- **AISStream.io 실시간 AIS 웹소켓 (해상)** — 서버측 수집기(워커/Edge Function)가 wss://stream.aisstream.io/v0/stream에 접속해 연결 후 3초 내 MMSI 목록 구독 메시지 전송, 모선 위치를 DB 적재 후 cargo 화면 지도에 서빙 — 선박 단위 위치의 무료 최선책(대양 공백 유의)
  - 키 발급: aisstream.io에서 GitHub 로그인 → API 키 즉시 발급 (무료, 승인 절차 없음)
- **HMM API Portal — Track and Trace DCSA v1 (해상·국적선사 어댑터 1순위)** — HMM 부킹 건을 DCSA T&T 이벤트로 수신하는 캐리어 어댑터로 구현 — 국적선사라 물량 비중 크고 한국어 포털, 승인 대기 동안 HMM 웹 딥링크로 브리지
  - 키 발급: apiportal.hmm21.com 기업회원 가입(사업자번호 필요) → HMM 심사·승인 → ID/키 발급 (승인제, 스케줄 API 시간당 300콜 제한)
- **Maersk Track & Trace Plus (해상)** — Maersk·Sealand·Hamburg Süd 건의 MBL/컨테이너 번호 DCSA 이벤트를 캐리어 어댑터로 연동 — 셀프서비스 무료 API 실존 선사 1순위
  - 키 발급: developer.maersk.com 무료 가입 → 앱 생성 → Consumer Key 즉시 발급(샌드박스 무료), 프로덕션 전환 시 앱 승인 절차
- **Hapag-Lloyd Track & Trace API (해상·베타)** — HL 건의 DCSA v2.2.4 이벤트 어댑터로 연동하되 BETA 라벨이므로 웹 추적 결과와 교차검증 로직 병행
  - 키 발급: api-portal.hlag.com 셀프서비스 가입 → 구독 신청 → 키 발급 (샌드박스 제공, 영업 접촉 불필요)
- **ZIM Public API (해상)** — ZIM 물량 발생 시 B/L·컨테이너 추적 어댑터로 연동 (공식적으로 free of charge 명시)
  - 키 발급: zim.com/contact-us/zim-api-support에서 조직 단위 API Token 신청서 제출 → 승인 대기 → OAuth 2.0 Client Credentials 인증
- **CMA CGM Visibility/Tracking API (해상·조건부)** — Public 티어 트라이얼 키로 PoC 후 지속 무료 조건 확인 — 불투명하므로 웹 딥링크 폴백을 반드시 병행하는 어댑터로 구현
  - 키 발급: api-portal.cma-cgm.com 가입 → Visibility 상품(Offer) 구독 → API 키 발급, Private 티어(내륙 이벤트)는 OAuth2+운송당사자 검증 필요
- **인천국제공항공사 화물편 운항현황 (항공)** — AWB에 매핑된 편명으로 getCargoArrivals/Departures를 조회해 도착·지연·결항 상태와 화물터미널(C01/C02/C03)을 표시 — 'UNIPASS 통관 + 편명 운항현황' 조합이 항공 추적의 현실적 구성
  - 키 발급: 공공데이터포털(data.go.kr) 회원가입 → 활용신청 → 자동승인 즉시 사용 (개발계정 1,000/일, 운영 전환·활용사례 등록 시 증액)
- **인천국제공항공사 화물기 운항 상세 D-3~+6 (항공)** — 미래 6일 스케줄로 AWB 건의 ETA 예고 표시 구현
  - 키 발급: data.go.kr 활용신청 — 개발단계 자동승인(500/일), 운영단계는 심의승인(100,000/일) 필요한 점 유의
- **해양수산부 선박운항정보 PORT-MIS VsslEtrynd5 (해상)** — B/L의 모선명·호출부호(clsgn)와 매칭해 '본선 입항 완료/출항'(ATA/ATD) 상태를 해상 건 타임라인에 표시
  - 키 발급: data.go.kr 활용신청 → 개발/운영 모두 자동승인 즉시 (개발계정 10,000/일)
- **해양수산부 내항컨테이너반출입정보 (해상·보조)** — 연안 피더 구간의 B/L번호·컨테이너번호 반출입 확인 보조 표시 (내항 한정이라 후순위)
  - 키 발급: data.go.kr 활용신청 자동승인 (개발계정 10,000/일)
- **DHL Shipment Tracking Unified API (항공·특송)** — DHL Express/DGF 경유 건을 trackingNumber 조회로 이벤트 타임라인 표출 (초기 250콜/일·5초당 1콜 한도라 캐시 필수)
  - 키 발급: developer.dhl.com 무료 가입 → 앱 등록 → 회사 프로필 검증 후 키 발급, 한도 상향은 별도 신청
- **한국공항공사 KAC Open API (항공·보조)** — 인천 외 지방공항 발착 화물편의 편명 기준 이착륙 상태 보조 표시 (AWB 단위 불가)
  - 키 발급: data.go.kr에서 현행 등재본 재검색 후 활용신청 (구 상세페이지 개편으로 확인 불가 — 연동 전 재검색 필요)
- **국토교통부 TAGO 국내항공운항정보 (항공·후순위)** — 국내선 구간(김포–제주 등) 스케줄 보조용으로만 연동 검토
  - 키 발급: data.go.kr 활용신청 자동승인 계열

## 3) 보조 수단
- **ONE eComm Cargo Tracking 딥링크 (해상)** — https://ecomm.one-line.com/...cargo-tracking?ctrackNo={번호} 프리필 파라미터로 '선사 사이트에서 보기' 새 창 버튼 구현 (HTTP 200 검증, ONE은 셀프서비스 API 부재라 딥링크가 최적)
- **HMM 웹 Track & Trace 딥링크 (해상)** — API 포털 승인 대기 기간의 브리지로 TrackNTrace.do 새 창 버튼 제공 (로그인 불필요, 200 검증)
- **Maersk / CMA CGM 웹 추적 딥링크 (해상)** — maersk.com/tracking/{번호}, cma-cgm.com ...SearchBy=Container|BL&Reference={번호} 새 창 버튼 — 양사 봇차단(502/403)이라 서버 스크래핑 불가, 사용자 브라우저 새 창만 유효
- **MSC 웹 추적 딥링크 (해상)** — msc.com/en/track-a-shipment?trackingNumber={번호} 새 창 버튼 (API는 영업 경유라 딥링크로 대체, 내부 API 직접 호출은 403 확인)
- **Evergreen ShipmentLink 딥링크 (해상)** — TDB1_CargoTracking.do?TYPE=QUICK&NO={번호} 새 창 버튼 (결과가 HTML 화면이라 파싱 대신 링크 방식)
- **고려해운 KMTC e-KMTC 딥링크 (해상·근해)** — cargo-tracking SPA 새 창 버튼 + 번호 클립보드 자동복사 보조 (Akamai 보호로 서버 호출·iframe 불가, 프리필 파라미터 미확인)
- **장금상선 Sinokor 딥링크 (해상·근해)** — ebiz.sinokor.co.kr/Tracking 새 창 버튼 — 조사 시점 HTTP 500(일시 장애 추정)이라 연동 전 재확인 후 활성화
- **부산 터미널 조회 딥링크 묶음 HJNC/PNIT/PNC/BNCT/HPNT/BPA체인포털 (해상)** — 부킹 건의 하역 터미널 코드→조회 URL 매핑 테이블을 만들어 컨테이너 번호 딥링크 버튼으로 터미널 반출입·본선작업 상태 연결 (HJNC·PNIT·PNC 200 검증, 스크래핑은 약관 확인 후)
- **CHAMP track.champ.aero/{IATA} 딥링크 (항공)** — CHAMP 커뮤니티 중소 항공사 AWB의 항공사별 인스턴스 URL로 새 창 연결 (AWB 최대 10건 동시 조회 폼)
- **track-trace.com 항공화물 범용 딥링크 (항공·폴백)** — 자체 미연동 항공사 AWB일 때 /aircargo?number={AWB} 만능 폴백 새 창 버튼 — 프리픽스로 242개 항공사 자동 식별 (실검증됨, 스크래핑 용도 아님)
- **DHL DGF ACTIVETracing 웹 (항공)** — DGF 항공화물 MAWB/하우스빌은 activetracing.dhl.com 공개 조회 딥링크로 보조 연결
- **해수부 PORT-MIS 파일데이터 자동변환 API군 (해상·이력)** — 갱신 주기가 월~반기라 실시간 추적 대신 입출항 이력·통계 보강용 배치 수집만 검토 (data.go.kr 자동승인)
- **해수부 외항화물반출입정보 (해상·통계)** — 개별 추적 부적합(집계 성격) — 대시보드 항만 물동량 위젯 데이터로만 활용 (무료키 자동승인)
- **NOAA MarineCadastre / 덴마크 DMA AIS 이력 (해상·분석)** — 실시간 불가 벌크 이력 — 항로 분석·ETA 모델 학습 등 백오피스 분석용으로만 보관 (DMA는 접속 실패로 재시도 필요)
- **Fintraffic Digitraffic Marine (해상·레퍼런스)** — 발트해 한정이라 직접 효용 없음 — 무키 공공 AIS API의 레퍼런스 구현으로 AIS 수집기 설계 시 참고
- **BarentsWatch Live AIS (해상·조건부)** — 노르웨이 수역 한정 — 북유럽 항로 화물 발생 시에만 무료 가입(OAuth2) 후 보조 연동 검토

## 4) 유료/불가
- 상용 컨테이너 추적 애그리게이터 일괄 (Vizion, Terminal49, project44, MarineTraffic API, SeaRates, ShipsGo, JSONCargo, Datalastic, VesselFinder, MyShipTracking, Sinay, TrackingMore, NavAPI) — 멀티캐리어 컨테이너 단위 무료 추적 API는 2026-07 현재 부재로 검증됨, 전부 유료 계약. 무료 대안은 '선사별 자체 API + 터미널 딥링크 + AISStream 선박 위치'의 3단 구성
- MSC Developer Portal — 셀프서비스 키 발급 불가, 영업 경유 고객 온보딩 후에만 자격증명 제공 (웹 딥링크로 대체, MSC 물량 크면 영업 채널 협의)
- APM Terminals API Store — 90일 무료 체험 후 유료 전환 추정 (PoC 판단용으로만 고려)
- Hapag-Lloyd Live Position — 실시간 GPS 위치는 컨테이너당 $15 유료 (무료는 T&T 이벤트까지만)
- CHAMP Traxon cargoHUB API — 유료 (무료는 track.champ.aero 공개 조회 페이지만)
- Global Fishing Watch API — 라이선스가 비상업 한정이라 상용 포털 편입 불가 (상업 라이선스는 개별 협의제)
- AISHub — 자체 AIS 수신기 상시 기여가 전제조건이라 포털 연동 수단으로 비현실 (수신기 설치 감수 시에만 재검토)
- UN Global Platform AIS / AISdb 등 학술 데이터셋 — 기관 자격 심사제, 민간 상용 포털 사용 불가
- 부산항만공사(BPA) — data.go.kr 오픈API 0건 확인, 공개 REST API 부재 (BPA-NET 연계는 별도 협약 검토 대상, 화면에는 터미널 딥링크로 대체)
- SP-IDC 해운항만물류정보센터 — 자체 공개 API 없음 (필요 데이터는 data.go.kr 해수부 API로 대체)
- NLIC / 해수부 LDSP — 공개 REST API 미확인으로 직접 연동 불가 (LDSP 선박 스케줄 데이터는 추후 스케줄 화면 보강 시 데이터 신청 검토)