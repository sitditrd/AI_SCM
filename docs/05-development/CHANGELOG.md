# TWL 물류 포털 — 개발 이력 전체 정리

작성일 2026-07-27 · 최종 개정 2026-08-11 (v1.9) · 저장소 https://github.com/sitditrd/AI_SCM · 문의 itt@twsc.co.kr

## 1. 개발 타임라인 (2026-07-24 ~ 08-03)

| 단계 | 개발 내용 | 핵심 산출물 |
|---|---|---|
| 0. 기반 | 데모 사이트(랜딩+Port Insight) + Supabase 연동, MCP·Agent Skills 설정 | index/insight, pi_* 테이블 |
| 1. 선석배정 | 통합 엑셀(9개 터미널, 시트별 이질 스키마) 분석 → PRD 작성 → 정규화 적재 파이프라인 → 대시보드 | berth.html, scripts/collect_upload_berth.py, bs_* 테이블 |
| 2. Port Insight 실데이터 | 오픈 API 6종 조사(실호출 검증) → IMF PortWatch 선정, Focus 93 매핑(93/93) → TW-PFS v1 산출·배포 | scripts/collect_portinsight_api.py, portwatch_mapping.json |
| 3. 실운용 재가공 | 전 파일 감사 89건 → 데모 문구·가짜 난수 분석 제거, 리스크 배지 버그 수정, 공식 CI 로고(심볼+타이포), 회사명·이메일 통일, e-tgl.com 실서비스 기준 개편 | 전 페이지, twl_symbol.png |
| 4. TW-PFS v2 | 활동량 60%+물동량 25%+모멘텀 15%, 부산·광양·인천 접안/대기 선석 실측 연계 | collect_portinsight_api.py v2 |
| 5. 오픈데이터 확장 | 6개 영역 전수 조사 41건 → 선박 위치(VesselFinder AIS)·항만 기상(Open-Meteo)·운임지수(SCFI/CCFI) 구현 | vessel.html, weather.js, collect_freight_index.py, freight_index 테이블 |
| 6. 운영 보드 | 데이터 현황 v2 — 종합 판정 배너·파이프라인 흐름도·소스 신선도 게이지·7일 적재 타임라인 | status.html/status.js |
| 7. 백엔드·화물 추적 | 로컬 백엔드(server.py) 신설 — 유니패스 화물통관진행 프록시(/api/track), MBL/HBL/AWB 조회 화면, AWB 항공사(10사)·해상 SCAC(12사) 자동 감지 딥링크 | server.py, cargo.html/cargo.js |
| 8. 알고리즘 탭 | ① 경로 분석: searoute 항로+몬테카를로 1만회(P10/P50/P90) ② ETA 지연 리스크: 접안편차 로그정규 적합+MC 4천회(표본 축적 시 자동 보정) | route.html/route.js, routes/(8,556구간), berth.js |
| 9. 배포 | 폴더 계층 재구성(scripts/·sql/·docs), Netlify 자동 배포(netlify.toml), 경로 분석 정적화(배포판 완전 동작), UI 버그 수정(그리드 짤림·진입 시 표 미표시·터미널 확대 이동) | netlify.toml, routes/ |
| 10. 07-28 기능 보강 | ① 선박 위치 "터미널 확대 이동" 완성(자동 스크롤+정중앙 펄스 핀+줌15) ② 용어 전문화: TW-PFS→PCI(Port Congestion Index) 전면 교체, 전주 대비 등 조어 정리 ③ 디자인 2026.5(카드·CTA·푸터 헤어라인)·라이트 테마 전면 수리(다크 고정 영역 테마 변수 오용 6건) ④ 선석배정 14일치 백필(3,218건, 헤더 변형 8종 자동 대응) ⑤ 선석배정 그리드 UX 2026.6: 페이지네이션·연속 스크롤(팬텀 스켈레톤)·컬럼 필터·트리 그리드·우클릭 퀵뷰 | vessel.js, 전 페이지, scripts/backfill_upload_berth.py, berth.html/js |
| 11. 07-28 배포·SRS·React | ① 폴더 계층화(css/js/assets) ② **GitHub Pages 무료 자동배포** 정착(Netlify 크레딧 소진 대체, private→Pages 다운 사고 복구) ③ **FR-01** Port Insight 포트 검색(국문/영문/LOCODE 자동완성→지도 포커스+상세패널) ④ **FR-03** 국내/해외 탭 전 화면 ⑤ 해외 스케줄 허브(schedule.html, Ship Schedule 3뷰·해외 터미널 준비중 기획) ⑥ 소요일 분포 SVG 차트 개선(밴드·밀도곡선·마커·툴팁) ⑦ 배포 폴리시(OG·sitemap·robots·a11y) ⑧ **React 이관**: 기반+선석배정+데이터현황(재사용 DataGrid) → 최종 채택 보류, app/ 제거(2026-07-28): 사유는 SEO 후퇴·번들 무게·빌드/인수인계 복잡도 | 전 페이지, schedule.html, .github/workflows/, README.md |
| 12. 07-31 운영 자동화·정비 | ① 선석배정 파서 헤더 변형 대응 확대(462→516건) ② 수집 스크립트 경로 수정 ③ Netlify 선별 게시+빌드 훅 완성(GitHub Pages 주경로의 미러) ④ 유니패스 화물 추적 Edge Function(track) 배포 ⑤ 스케줄러 3종 등록·스케줄러 체계 문서 신설 ⑥ i18n 대량 보강 ⑦ 07-31분 515건 적재 | scripts/collect_upload_berth.py, netlify.toml, supabase/functions/track, docs/06-operations/스케줄러_체계.md |
| 13. 07-31 status 헬스체크 | 외부 연동 헬스체크 섹션(SECTION 05) 신설 — Edge Function track·datago(needKey 응답은 "정상(키 대기)" 판정)·send-code(OPTIONS)·Open-Meteo marine 4종을 45초 주기 점검, 응답시간 게이지(3초 기준)·8초 타임아웃, 신규 문구 i18n(EN/ZH) 반영 (로드맵 §4 status P1) | status.html/js/status.js, js/i18n.js |
| 14. 08-01~03 운영 안정화·이력 축적 | ① 예측분석 Phase 1 이력 테이블 3종 신설(pi_history·weather_history·vessel_positions, 전부 RLS+익명 select) ② RPC berth_daily_counts(days=7) 도입(PostgREST 집계 비활성 대체) ③ Edge Function datago 신설(data.go.kr 공용 프록시, 별칭 화이트리스트 portmis·aircargo) → Edge Function 3종 ④ 자체 AIS 수신 PoC(AISStream 웹소켓 90초 스냅샷 + vessel 지도 레이어) ⑤ **Windows 작업 스케줄러 TWL_BerthUpload 07:30 신설**로 선석 적재 정시 보장(--rest 직접 적재, 08:03 Claude 작업은 안전망으로 이중화) ⑥ status 7일 타임라인을 로그 기준 → **적재 실적(berth_daily_counts) 기준**으로 전환 ⑦ 무인 실행용 도구 권한 사전 허용(~/.claude/settings.json) | sql/setup_history.sql, scripts/upload_berth_sql_parts.py, scripts/run_berth_upload.bat, supabase/functions/datago, js/status.js, vessel.html/js |
| 15. 08-03 data.go.kr 활용신청·키 등록·프록시 v5 | ① **data.go.kr 오픈API 활용신청 12종 자동승인 완료**(PORT-MIS 입출항·선박제원·관제·항만별 입출항실적·수출입/국가별 컨테이너·인천공항 화물편 3종·인천항 입출항·기상특보·중기예보, 만료 2028-08-03). 15084033(연안AIS)·3068846(환율)은 **LINK형**이라 신청 대상 아님을 확인 ② **`DATA_GO_KR_KEY` 등록 완료 → 별칭 15종 전부 실조회 검증(NORMAL_SERVICE)** ③ Edge Function `datago` **v5 배포** — 별칭 2종 → **15종** 확장, 기관별 JSON 파라미터(`type`/`dataType`/미지원)·페이징(`pageNo` / `skipRow`+`endRow`) 자동 분기, **XML→JSON 자동 변환**, 인증키 Decoding/Encoding 정규화, `?api=list` 별칭 조회 ④ **버그 수정 4건**: XML 전용 API가 `data` 없이 `raw`만 반환해 vessel 화면이 결과를 못 그리던 문제 / vessel.js PORT-MIS 날짜 파라미터 `fromDt,toDt` → 규격 `sde,ede` / Encoding 키 이중 인코딩(코드 30) / 인천항만공사에 `pageNo` 주입 시 코드 99 | supabase/functions/datago/index.ts, js/vessel.js, docs/03-architecture/API.md |
| 16. 08-03 P1 화면 5종 구현 | `DATA_GO_KR_KEY` 등록 후 로드맵 §6-B P1을 화면에 반영 — ① **vessel**: SHIP SPEC 섹션(선박명/호출부호 조회, 행 클릭 시 상세 15항목) ② **index**: 월간 컨테이너 TEU 스트립 + 기상특보 티커(특보 없으면 자동 숨김) ③ **insight**: SECTION 07 물동량 추이(12개월 수입/수출 누적 막대 + 최신월 지역별 순위, 앵커탭 Volume) ④ **route**: 시뮬레이션 KPI에 '한국↔도착국가' 실적 카드 ⑤ **schedule**: AIR CARGO 섹션(도착/출발 운항현황·정기 운항편 3탭, js/schedule.js 신설). **환율 KPI·UNIPASS 통관은 보류**(각각 수출입은행 자체 포털 키·`UNIPASS_API_KEY` 필요) | js/vessel.js, js/landing.js, js/insight.js, js/route.js, js/schedule.js(신규), js/i18n.js |
| 17. 08-03 P2 화면 3종 구현 | 프록시에 열려 있으나 화면 미연결 상태였던 별칭 3종을 연결 — ① **vessel**: VTS 관제 이벤트 섹션(`vtscontrol`, 항만청 선택+기간 조회 → 선박명·호출부호·선종·총톤수·선적국·입항일시). 실측상 데이터가 나오는 항만청은 부산020·인천030·평택031·경인050 **4곳뿐**이라 셀렉트를 이 4개로 한정 ② **insight**: SECTION 08 항만별 선박 입출항 실적(`portstat`, 앵커탭 Calls) — KPI 3종(총 입항 척수·입항 총톤수·외항선 비중) + 상위 15개 항만 표 + 국적선/외국선/연안선 구성 스택바. 해수부 약 2개월 지연 공표 특성상 **실적 있는 최신월 탐색** 방식 적용 ③ **berth**: 인천항 선박 입출항 섹션(`incheonship`, 입출항 일시·목적항/차항지·입항목적·대리점). 목적항이 비는 건이 많아 **차항지 폴백** 처리 ④ 다국어: T 키 9개(ko/en/zh 27항목)·PHRASES 88쌍·RULES 12개 추가, 캐시버전 2026-08-03e 통일 ⑤ **잠재 버그 수정**: 기존 `N개 항만` 규칙이 "15개 항만청 합계"를 `15 ports청 합계`로 깨뜨리던 문제 → 더 구체적인 규칙을 앞에 배치 | vessel.html/js, insight.html/js, berth.html/js, js/i18n.js |
| 18. 08-04~09 적재 견고화 | ① **선석 적재 자동화 강화**: `TWL_BerthUpload` 트리거를 07:30 1회 → **07:30/09:30/12:00/15:00 4회**(수집 지연 시 자동 재시도), `--today` 를 당일 단건 → **최근 3일 캐치업**으로 확대. **과거 파일 대체 적재 제거** — 파일이 없는데 어제 데이터를 오늘 날짜로 넣고 exit=0 으로 끝나 수집 실패를 "정상"으로 감추던 동작(08-04 실측) ② **수집 파일 형식 변경 대응**: 06시 수집기가 일부 날짜에 SpreadsheetML(`.xls`)로 저장하는 것을 확인해 확장자 병행 탐색 + 자동 변환 ③ 관리자 시드에서 고정 기본값 제거(임의값 생성) ④ status 적재 이력 상세를 최근 7일로 제한 | scripts/upload_berth_sql_parts.py, scripts/run_berth_upload.bat, js/status.js |
| 19. 08-10 AIS 수집 장애 원인 규명·실패 분류 | ⑥ AIS 수집이 08-04 이후 계속 실패하던 건을 재진단 — **원인은 aisstream.io 업스트림 무응답**으로 확정(핸드셰이크·API 키 정상, 전세계 bbox·필터 해제에도 프레임 0개, 잘못된 키에도 오류 응답조차 없음 → 서버 애플리케이션 계층 무응답. 동일 증상 업스트림 이슈 미해결·BETA/SLA 없음). `collect_ais_positions.py`가 모든 실패를 `수신 0건 — 키/네트워크/바운딩박스 확인`으로 뭉뚱그려 **로컬 설정을 반복 점검하게 만들던 오진**을 수정: 종료 코드 0/1/2/3 분리(정상/키 미등록/접속 실패/업스트림 무응답), 핸드셰이크 예외를 HTTP 상태까지 노출, 연결 종료 사유 보존. 스케줄 지침도 코드 3은 **재시도 없이 건너뜀**으로 변경(짧은 간격 재시도가 429를 유발). ⑦ vessel 화면의 '자체 AIS 수신 현황' 섹션은 유입 재개까지 화면에서 제외(선박 제원까지만 노출) | scripts/collect_ais_positions.py, js/vessel.js, docs/06-operations/스케줄러_체계.md, scheduled-tasks/ais-positions-collect/SKILL.md |
| 20. 08-11 선석 적재 2일 공백 복구 | ② 적재가 **08-10·08-11 두 날짜분 누락**된 것을 발견·복구. 원인은 로컬 코드도 터미널 공표도 아닌 **06시 수집기(①)의 산출 위치 변경** — 08-09 18:13 부로 통합 xlsx 가 `D:\터미널 스케쥴 정보\` 루트에서 **`통합\YYYY\MM\` 아카이브 구조로 이동**했는데 적재기는 루트만 탐색해 매 실행 `[SKIP]`(exit=1)로 끝나고 있었다(수집기 자체는 08-11 06:56 까지 정상 가동 중이었음). `integrated_path()` 신설로 **루트+아카이브 두 위치를 모두 탐색**(확장자 `.xlsx`/`.xls` 병행 유지)하도록 수정하고 캐치업 수동 실행 → **08-09 498건·08-10 515건·08-11 510건 복구**(bs_collect_log SUCCESS 확인). `--today` 캐치업이 최근 3일만 보므로 방치 시 08-12에 08-09분이 범위를 벗어나 실제 유실로 굳을 상황이었다. 운영 신호로 **`logs/berth_upload.log` 의 `[OK]` 연속 실종**을 문서화 | scripts/upload_berth_sql_parts.py, docs/06-operations/스케줄러_체계.md |
| 21. 08-11 화물 추적 — 선사 직접조회(KLNET 대체) | 레거시 TWSC의 KLNET 유료 추적을 무료 선사 직접조회로 대체 — ① **레거시 4계층 병렬 분석**(KlnetTrackList 화면 6밴드 53컬럼·KlnetTrkAPIBatch의 PLISM API 연동·SeaBkg 부킹의 MBL/선사코드 체계·FMS_API_* 3레벨 데이터 모델) → 설계 문서화 ② **선사 13사 엔드포인트 실호출 검증**: ONE·COSCO만 서버사이드 조회 가능(나머지는 TLS 지문/안티봇 차단 — HMM은 비브라우저 TCP 드랍, KMTC는 Akamai). ONE은 실 BL로 search/cop-events/voyage-list 3종 완전 검증 ③ **Edge Function `carrier-track` 신설·배포**(4번째 함수, 키·시크릿 불요): SCAC 화이트리스트 어댑터(live ONEY·COSU, 그 외 딥링크 폴백), 레거시 3레벨 계승 정규화 계약(summary/voyages N구간/containers.events), 항만 현지시각+실제/예정 구분 ④ **cargo 화면 전면 재편**: 선사 직접 추적 전용 — MBL 감지 시 live 선사(ONE·COSCO)는 운송 카드(항차 표+컨테이너별 이벤트 타임라인), 그 외 선사·AWB는 딥링크 카드. **유니패스 통관조회는 화면에서 제거**(사용자 결정 — Edge Function track·server.py 경로는 보존, MBL/HBL 칩·연도 선택도 함께 제거) ⑤ i18n PHRASES 36쌍 추가(중복 키 회피 — 기존 '출항'/'도착'/'예정' 보존) ⑥ E2E: 배포 함수를 실 BL(밴쿠버→부산, 컨테이너 2개·이벤트 16건)로 검증. 배포 후 화면 E2E에서 **SCAC 감지 정규식 버그 발견·수정** — '4글자+숫자만' 패턴이 ONE처럼 부킹오피스 문자가 섞인 BL(ONEYRICG…)을 놓침 → 영숫자로 완화 | supabase/functions/carrier-track/index.ts(신규), js/cargo.js, cargo.html, js/i18n.js, docs/03-architecture/화물추적_선사직접조회_설계.md(신규) |
| 22. 08-11 화물추적 확대 — 실 MBL 검증 + live 선사 5사 | 태웅 실운영 DB(`ELVIS_TWSC.FMS_MBL_MST`, 35.7만건)를 조회하는 `oracle-elvis` MCP를 신설하고 **실제 태웅 MBL로 전수 검증** — ① 선사별 물량 순위 산출(2025년+ 해상: 머스크 9,622 · 흥아 8,331 · 장금 7,747 · HMM 7,553 · MSC 6,830 · 고려 6,356 · ONE 6,221 …) ② **COSCO 전건 실패 버그 발견·수정**: `COSU` 프리픽스를 붙여 보내면 업스트림이 HTTP 200 + "No data"로 **조용히** 빈 응답 → 정상처럼 보여 더 위험. ONE의 `ONEY` 제거와 동일 규칙 적용 후 **0/8 → 8/8**, 응답 구조도 실물 기준 재매핑(trackingPath·actualShipment N구간·실제/예정) ③ **live 어댑터 3사 신규**(리버스엔지니어링 워크플로 3에이전트 병렬): **SM상선**(`CUP_HOM_3301GS.do`, f_cmd 121→124→125, 스테이트리스 JSON) · **Evergreen**(ShipmentLink `TYPE=BL`+`TYPE=CntrMove`, HTML 파싱·hex 엔티티 디코드·MON-DD-YYYY 변환) · **SITC**(`searchTrack`+`movementDetail`, 레이트리밋 5회/45초 대응해 상세는 상위 3컨테이너만) ④ **프리픽스 제거 규칙이 선사 공통 패턴**임을 확인(ONEY·COSU·SMLM 모두 SCAC를 떼야 조회) ⑤ SITC는 BL이 `SITPTTA…` 형태라 4글자 판별 실패 → 3글자 판별 보정 ⑥ 화면 live 5사 반영 | supabase/functions/carrier-track/index.ts(v3), js/cargo.js, cargo.html, js/i18n.js, docs/03-architecture/화물추적_선사직접조회_설계.md |
| 23. 08-11 BL 등록·감시·알림 (KLNET LogisView 대체) | 실시간 조회만 되던 화물추적에 **등록 기반 감시 계층**을 얹어 유료 서비스(LogisView 월 구독)를 무료로 재현 — ① DB 3종 신설(`bl_watch` 등록 · `bl_snapshot` 수집 이력 · `bl_change_log` 변경 이력, 전부 RLS 읽기전용) ② 수집기 `collect_bl_watch.py` — 등록 BL 조회 → 스냅샷 → 직전 대비 변경 감지 → 메일. **공컨 반납 확인 시 자동 종료**(레거시 KLNET 배치와 동일 조건) ③ **스케줄러 ⑧ `TWL_BlWatch` 신설(매일 08:20·20:20)** — 스케줄러 8종 체제 ④ Edge Function 2종 신설: `notify-bl`(변경 알림 메일) · `bl-watch`(등록/해제/목록 — 정적 사이트는 RLS 로 DB 쓰기 불가) ⑤ 알림 범위는 **ETD/ETA 변경만**(사용자 결정), 본선·항차/단계 진입/반출·반납은 `NOTIFY` 딕셔너리에 **정의만 해두고 비활성** — 플래그만 바꾸면 활성 ⑥ 화면: 조회 결과 헤더에 [추적 등록] 버튼, 하단에 감시 목록 섹션(상태·구간·ETD/ETA·변경 건수·해제) ⑦ 메일은 **ASCII 전용**으로 작성 — denomailer 가 비Latin1 제목/본문을 btoa 인코딩하다 실패하는 기존 제약 준수, 한국어 라벨은 영문 매핑 ⑧ 실 BL E2E: 등록→수집→ETD/ETA 변경 감지→메일 수신까지 확인. 검증 중 **발송 후 `notified` 미갱신(중복 발송 위험) 버그 수정**, 마감 범위를 이번 실행분으로 한정해 과거 실패분이 덮이지 않게 보정 | sql(마이그레이션), scripts/collect_bl_watch.py(신규), scripts/run_bl_watch.bat(신규), supabase/functions/notify-bl·bl-watch(신규), js/cargo.js, cargo.html, css/style.css, js/i18n.js, docs/06-operations/스케줄러_체계.md |
| 24. 08-11 감시 그리드 개편 5종 | 감시 목록이 단순 테이블이라 실무에 못 쓴다는 지적을 반영 — ① **일괄 등록**: BL 번호 붙여넣기(줄바꿈·쉼표, 최대 500건) → 선사 자동 판별 → 일괄 등록, **실패 건은 사유별로 표시**(형식 오류/중복/미지원 선사) ② **지원 선사 안내**: 등록 다이얼로그에 실조회 5사를 명시하고, 목록에서는 딥링크 전용 선사에 `딥링크` 표기 — 무엇이 자동 조회되는지 화면에서 바로 알 수 있게 함 ③ **그리드 개편**(선석배정과 동일 사상): 페이지네이션(20행) · 검색(B/L·메모) · 선사 셀렉트 · 상태 칩(전체/감시중/종료) ④ **추적 기간**: `expires_at`·`term_months` 컬럼 추가, 등록 시 **3개월/6개월 선택**, 만료 시 수집기가 조회 없이 자동 해제(공컨 반납과 별개 종료 조건). 목록에 남은기간 표시(14일 이하 경고색) ⑤ **COSCO 보강**: bill 응답에 컨테이너 게이트 이벤트가 없음을 확인(필드는 있으나 전건 null)하고, `containers/{cntrNo}` 의 `containerCircleStatus` 로 **최신 상태·위치**를 추가 조회해 표시 | supabase/functions/bl-watch(v2)·carrier-track(v5), scripts/collect_bl_watch.py, js/cargo.js, css/style.css, cargo.html |
| 25. 08-11 사용자별 화물 격리 + 관리자 전체보기 | 감시 목록이 전사 공유라 영업 정보가 노출되던 문제 해결 — ① `bl-watch` 가 모든 호출의 **세션 토큰을 `app_me` RPC 로 서버 검증**(role·login 획득). 클라이언트가 보낸 `created_by` 는 신뢰하지 않고 **검증된 신원만 소유자로 기록** ② 일반 사용자는 **자기 등록분만** 조회·해제, 관리자(role=admin)는 **전체 조회·해제**. 소유자 필터를 PostgREST 질의 조건에 넣어 **서버에서 강제**(클라이언트 우회 불가) ③ 비로그인은 목록이 빈 채로 반환되고 등록·해제는 401 ④ 관리자 화면에 **등록자 컬럼**과 `관리자 · 전체 조회` 배지, 일반 사용자에겐 `<본인> 등록분` 표기 ⑤ **버그 수정**: 목록이 비면 툴바를 통째로 렌더하지 않아 **일괄 등록 버튼이 사라지던 문제**(안내문은 "아래 일괄 등록으로"라고 안내) — 빈 상태에도 버튼 노출 ⑥ 검증: 위조 3종(토큰 없음/가짜 토큰/`created_by` 위조) 전부 차단, 실계정 2개(user·admin)로 시야 분리·타인 화물 해제 차단 E2E 확인 | supabase/functions/bl-watch(v3), js/cargo.js, docs/06-operations/스케줄러_체계.md |
| 26. 08-11 적응형 폴링 + 감시 그리드 필터 보강 | ① **적응형 폴링**: `next_poll_at`·`poll_tier` 컬럼 추가. 스케줄러를 **2시간 주기**(06:20~22:20, 9회)로 바꾸되 실제 조회는 등급별로 — near(ETD/ETA ±3일)=3h·transit=12h·pre=24h·실패=30분 재시도. 총 호출량은 하루 2회 수준으로 유지하며 임박 구간 반응성만 상승. 같은 회차 내 **선사 인터리브**로 SITC 429(연속 5~6회 실측) 회피 ② **그리드 필터 보강**(선석배정 조회 영역 사상): 기존 검색·선사·상태(감시중/종료)에 더해 **진행상태 셀렉트**(운송중·입항·양하·선적 등 실데이터 기반)·**구간(항구) 검색**·**정렬**(등록순/ETD/ETA/남은기간)·**필터 초기화** 추가 ③ 검증: 진행상태 필터 8→2건, 구간 필터 ISTANBUL→1건 실동작 확인 | scripts/collect_bl_watch.py, js/cargo.js, docs/06-operations/스케줄러_체계.md · TWL_BlWatch 트리거 9개 |
| 27. 08-11 감시 UX 마감 — 알림 가시화·종료 표시·모달 통일 | ① **알림 컬럼 전면 배치**: 이메일 전문 컬럼이 표 오른쪽 끝에 있어 가로 스크롤 없이는 안 보였다 → 상태 옆에 **종 아이콘 컬럼** 신설(켜짐=수신 등록, 툴팁에 주소). ② **목록에서 이메일 직접 변경**: 종 클릭 → 등록·변경·해제. `bl-watch` 에 `notify` 액션 추가(소유자 검증은 remove 와 동일). BL 재조회 불필요 ③ **재조회 시 등록 상태 유지**: 등록 직후에만 초록 "등록됨" 이 떴다가 재조회하면 사라지던 문제 → 감시 목록을 참조해 이미 등록된 건은 처음부터 `✓ 감시 중` 으로 표시, 클릭 시 목록으로 스크롤 ④ **종료 건 알림 비활성 표시**: 종료 건(반납 완료·기간 만료)은 `active=false` 라 수집 자체가 멈춰 실제 알림은 나가지 않았으나 종이 켜진 채여서 오해를 샀다 → 점선·흐림·disabled 로 표시하고 툴팁에 사유 명시 ⑤ **네이티브 다이얼로그 제거**: `prompt`/`confirm`/`alert` 을 사이트 모달로 교체(알림 수신 설정 모달·확인 모달 신설, 오류도 모달 내 표시, Enter 저장·바깥 클릭 닫기). cargo.js 잔존 0건 | supabase/functions/bl-watch(v4), js/cargo.js, css/style.css, cargo.html |
| 28. 08-12 DCSA 공용 어댑터 — 머스크·CMA CGM·하파그로이드 (키 게이트) | 물동량 1위 머스크(8.04%)부터 B등급 확장 착수 — ① **정찰 실측**: 머스크 공개 스크래핑 경로는 Akamai 봇매니저가 전면 차단(synergy·track v2 403), 공식 게이트웨이 `track-and-trace-private/events` 는 401 ERR_GW_001 로 **Consumer-Key 요구 단계까지 도달** 확인. CMA `apis.cma-cgm.net`(keyId 헤더)·하파그 `api.hlag.com/hlag/v2/events`(X-IBM-Client-Id/Secret) 각각 401 실존 확인 ② **DCSA T&T v2.2 공용 파서** `dcsaParse`: TRANSPORT(ARRI/DEPA×EST/ACT/PLN)·EQUIPMENT(LOAD/DISC/GTIN/GTOT/PICK/DROP×EMPTY/LADEN) → 기존 9개 게이트 슬롯 어휘로 발행. **환적 판별 휴리스틱**(뒤에 DEPA 가 남은 ARRI=환적항, 2회차 LOAD=환적적재)으로 환적항 도착이 '입항' 슬롯을 가로채지 않게 함. 합성 페이로드(부산→싱가포르 T/S→로테르담, 컨테이너 2개) 9/9 검증, SLOTS·STAGES 정규식 15어휘 전수 매칭 확인 — **화면·수집기 무수정 호환** ③ **키 게이트(`ready`)**: Secrets 미등록이면 목록·조회 모두 딥링크 폴백 유지, 등록 즉시 다음 호출부터 실조회 승격(재배포 불요). 인증 3색 분기 — 머스크 Consumer-Key+OAuth2(토큰 모듈 캐시), CMA keyId, 하파그 IBM 쌍 ④ 화면은 `?api=list` 의 live 목록을 로드 시 merge — 선사 확장 시 화면 재배포 불요 ⑤ 신청 가이드 정정: CMA 포털 api-portal.cma-cgm.com, 하파그 api-portal.hlag.com, 머스크는 Consumer-Key 외 OAuth 자격+고객코드 필요(수동 승인) ⑥ 미결: Edge Function 배포는 Supabase 커넥터 재연결 후(코드 완성·검증 완료 상태) | supabase/functions/carrier-track(v6 예정), js/cargo.js, cargo.html, docs/05-development/선사API_키신청_가이드.md |

## 2. 최종 기능 (8개 화면, 전부 실데이터)

| 화면 | 기능 | 데이터 소스 | 배포판 동작 |
|---|---|---|---|
| index | 서비스 소개(사업영역 6+디지털 6) · PCI 스트립 · 운임지수 스트립 · **월간 컨테이너 TEU 스트립 · 기상특보 티커** | Supabase + data.go.kr(datago) | ✅ |
| insight | PCI v2 게이지·분포·권역·지도·Top10 · **컨테이너 물동량 추이(SECTION 07)** | IMF PortWatch(위성 AIS) + 해수부(datago) | ✅ |
| berth | 16개 터미널 선석배정(07-29 확대), 필터/검색, 반입마감 임박 강조, 항만 기상, ETA 지연 리스크, 그리드 UX(페이지네이션·연속 스크롤·컬럼 필터·트리 그리드·우클릭 퀵뷰) | 터미널 공표+Open-Meteo | ✅ |
| schedule | 해외 스케줄 허브 — Ship Schedule 3뷰(준비중), **항공 화물편 스케줄(도착/출발 운항현황·정기 운항편 3탭, 실데이터)**, 해외 터미널 현황(준비중), 국내/해외 탭 | 인천공항공사(datago) + LOCODE 기반 | ✅ (항공편 실조회) |
| vessel | 실시간 AIS 지도(4개 항만), 선명/항차 검색→터미널 확대 이동, VesselFinder 연동, PORT-MIS 입출항 실적 조회, 자체 AIS 수신 지도(Leaflet, 5분 재조회) | VesselFinder+선석 DB+PORT-MIS(Edge Function datago)+vessel_positions(AISStream) | ✅ (PORT-MIS 실조회 가동 2026-08-03) |
| cargo | MBL/HBL/AWB 통관 진행 조회(유니패스), 선사·항공사 자동 감지 딥링크 | 관세청 유니패스 | 안내(로컬 전용) |
| route | 해상 항로+소요일 몬테카를로(P10/P50/P90, 히스토그램, 지도) · **도착국가 물동량 근거 KPI** | searoute 사전계산 8,556구간 + 해수부 국가별 실적(datago) | ✅ |
| status | 종합 판정·흐름도·신선도 게이지·7일 타임라인(적재 실적 기준)·이력·외부 연동 헬스체크 | berth_daily_counts·bs_collect_log 등 + Edge Functions·Open-Meteo | ✅ |

## 3. 데이터 파이프라인·자동화

- **스케줄러 7종(2026-08-03 기준)**

| # | 시각 | 이름 | 실행 주체 | 하는 일 | 산출물 |
|---|---|---|---|---|---|
| ① | 매일 06:00 | Terminal schedule collection | Cowork 앱 | 터미널 16곳 수집 → 통합 엑셀 + 리포트 메일 | `D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_YYYYMMDD.xlsx` |
| ② | 매일 07:30·09:30·12:00·15:00 | TWL_BerthUpload | **Windows 작업 스케줄러** | `scripts/run_berth_upload.bat` → `upload_berth_sql_parts.py --rest --today`(REST 직접 적재, 최근 3일 캐치업). 07:30이 주 실행이고 나머지 3회는 수집 지연 시 재시도(08-04 확대) | bs_vessel_calls + bs_collect_log |
| ③ | 매일 08:03 | berth-upload-supabase | Claude 앱 | 최근 7일 건수 비교로 미적재·부분적재 자동 복구(②의 안전망) | 동일 |
| ④ | 매일 08:44 | portinsight-daily-update | Claude 앱 | PortWatch → PCI 재산출 + pi_history 일별 append | pi_ports · pi_snapshot · pi_history |
| ⑤ | 매시 30분 | ais-positions-collect | Claude 앱 | AISStream 웹소켓 90초 수신 스냅샷 | vessel_positions(48h 보존) |
| ⑥ | 6시간마다 | weather-history-collect | Claude 앱 | Open-Meteo 파고·풍속 이력 | weather_history |
| ⑦ | 월·금 17:02 | freight-index-update | Claude 앱 | KCCI·SCFI·CCFI | freight_index |

- ②가 주 경로(앱 기동 여부와 무관하게 정시 보장), ③이 안전망 — 둘 다 동일 수집일 replace(멱등)라 중복 실행이 안전. ④를 ② 뒤에 두는 이유는 부산·광양·인천 접안/대기 척수를 당일 선석 실측으로 보정하기 때문
- **키 보관**: `SUPABASE_SERVICE_KEY`·`AISSTREAM_API_KEY` 사용자 환경변수 등록 완료(②·⑤ 가동) — 키 미보관 원칙에서 ②만 예외적으로 PC 보관. `DATA_GO_KR_KEY`(Edge Function datago)는 2026-08-03 등록 완료(15종 실조회 검증). `UNIPASS_API_KEY`(Edge Function track)만 미등록 대기이며 등록 즉시 코드 수정 없이 동작. 수집 스크립트의 `env_key()`가 환경변수 미상속 시 Windows 사용자 환경변수 레지스트리에서 키를 직접 읽음(setx 직후 재시작 불필요)
- **배포**: git push → GitHub Pages 자동 배포(주경로, .github/workflows/) + Netlify 미러(선별 게시·빌드 훅, netlify.toml)
- **DB(Supabase)**: pi_ports/pi_snapshot/pi_history · bs_terminals/bs_vessel_calls/bs_collect_log · freight_index · weather_history · vessel_positions (전 테이블 RLS 읽기 전용, 쓰기는 service_role/MCP) / RPC `berth_daily_counts(days int default 7)`(stable·security invoker, anon·authenticated 실행 허용) / Edge Function 3종 track·send-code·datago

## 4. 폴더 구조

```
C:\Temp\AI_SCM\
├─ *.html ×7, *.js ×10, style.css, twl_symbol.png, twl_logo.ico   (웹 루트)
├─ server.py / start_server.bat                                   (로컬 서버 8090 + /api)
├─ netlify.toml                                                   (자동 배포)
├─ scripts\   수집기 3종 + upload_berth_sql_parts.py + run_berth_upload.bat + gen_routes.py + portwatch_mapping.json
├─ sql\       셋업 2종 + setup_history.sql(이력 테이블 3종) + 수집기 생성 SQL 3종
├─ supabase\functions\   Edge Function 3종(track · send-code · datago)
├─ routes\    사전계산 항로 93파일(8,556구간)
├─ docs\  PRD · 개발계획서 · 프로젝트개요 · 상세기술서 · 화면기획 · 개발이력(본 문서)
└─ 터미널 스케쥴 수집\   일일 수집 엑셀 입력
```

## 5. 검증 이력 요약
- 선석배정 224건 정규화(중복 제거 후 223) 적재·필터·검색 E2E / PortWatch 10,212행 → 93개 TW-PFS 산출·화면 반영
- Supabase 보안 어드바이저 0건, 콘솔 오류 0건, 라이트/다크·회사명(태웅로직스)·이메일(itt@) 통일
- "선석배정" 용어 = 터미널 공식 용어(HJNC·PNC·DGT·BPT 메뉴명) 확인
- 경로 분석: 부산→로테르담 10,899nm·P50 28.9일(실제 스케줄 정합), 정적화 후 로컬=배포판 동일 검증
- ETA 리스크: HJNC 1%(표본 8)·DGT 0%(표본 5) 실측 적합, 무표본 터미널 "기본모델" 구분 표시
- 스케쥴 실행 검증: berth-schedule-upload 실행 성공 이력(bs_collect_log SUCCESS)
- (07-28) 오픈 API 전 화면 E2E: PortWatch 실호출(부산 7/17까지 수신·10,120행)·Open-Meteo 200·UNIPASS 프록시 needKey 안내·routes 93파일 200·VesselFinder 임베드 로드 — 전부 정상, PCI 수동 산출·적재로 당일 갱신 보정
- (07-28) 선석배정 백필 14일 3,218건 적재 검증(일자별 9개 터미널·ETA 100%) · 그리드 UX 6개 시나리오 E2E(페이지 이동·컬럼 필터·트리 펼침·lazy 로드·퀵뷰·ESC)
- (08-03) 적재 실적 07-31 515건 · 08-01 494건 · 08-02 451건 · 08-03 482건 (07-30은 06시 수집 미실행으로 원본 엑셀 자체가 없음)
- (08-03) 장애 2건 해결: ① 08:03 앱 미기동으로 08-02·08-03분이 09:10~09:27에 캐치업된 '지연'(유실 아님) → Windows 작업 스케줄러 ② 신설로 정시 보장 ② 08-01은 데이터 494건이 적재됐으나 part_99 미실행으로 로그만 누락 → 화면이 '없음' 오표시 → 타임라인 실적 기준 전환 + 로그 보정 + 스케줄 지침에 로그 누락 자동 복구 단계 추가
- (08-11) 적재 실적 08-09 498건 · 08-10 515건 · 08-11 510건 (수집기 산출 경로 변경으로 2일 공백 → 캐치업 복구, 16개 터미널 전부 수집). KITL 헤더 변형 경고는 08-09 이후 해소(47건 정상 파싱), PNCT(12건)·DDCT(4건) 소량 수집은 원본 컬럼 부족 이슈로 잔존
- (08-03) `run_berth_upload.bat` **ASCII 전용 유지 필수** — cmd.exe가 .bat를 콘솔 코드페이지로 파싱해 한글이 섞이면 줄이 깨지고 작업이 "성공(결과 0)"으로 끝나면서 아무 일도 하지 않음(실측 장애)

## 6. 남은 과제
1. ~~`SUPABASE_SERVICE_KEY`(sb_secret) → Windows 스케줄러 활성~~ **완료(2026-08-03)** — 사용자 환경변수 등록으로 ② TWL_BerthUpload 07:30 REST 직접 적재 가동
2. ~~`DATA_GO_KR_KEY`(Edge Function datago)~~ **완료(2026-08-03)** — 활용신청 12종 승인 + 키 등록 + 별칭 15종 실조회 검증. 후속은 로드맵 §6-B P1 화면 개발(vessel 제원 팝업 → index TEU·기상특보 → insight TEU 추이 → route 물동량 → schedule 항공편). `UNIPASS_API_KEY`(Edge Function track) → 화물 추적 실조회(통관 타임라인)는 등록 대기
3. ~~AISStream 무료 키 → 자체 AIS 레이어~~ **키 등록·수신 PoC 완료(2026-08-03)** — vessel_positions 매시 30분 축적 중, 묘박지 대기 실측 활용은 이력 축적 후
4. ORS 키 → 내륙 운송 경로 최적화 탭(제안 ③)
5. KCCI 파서 보완(KOBC 그리드 비동기) · Figma 편집 좌석(기획 이관)
6. v3 지표: UNCTAD 선석점유율+Erlang C·CPPI형 생산성(방법론 실데이터 검증 완료, 이력 축적 후)
7. **React+TypeScript(Vite) 전환 — 채택 보류(app/ 제거), 운영은 정적본 유지 (2026-07-28)**: 검토 결과 채택 보류하고 app/ 폴더를 저장소에서 제거(git 이력엔 보존). 사유는 SEO 후퇴·번들 무게·빌드/인수인계 복잡도이며, 정적본 대비 사용자 체감 이점이 없어 운영본은 바닐라 정적 사이트(HTML/JS)로 유지(빌드 불필요).
8. **(07-28 신규) 화물 추적 무료 API 확충**: UNIPASS 외 공공데이터포털·해외 무료 API·선사 공개 조회 조사 결과 반영 (해상 우선 → 항공)
9. **(07-28 발견) 스케줄 캐치업 실행 시 적재 미반영 점검**: 07-28 06시대 미실행 → 08:38 지연 실행됐으나 pi_*·bs_collect_log 미갱신, 원인 조사 필요 (당일분은 수동 실행으로 보정 완료)
10. **(08-03 알려진 이슈) 터미널 파서**: PNCT는 원본 엑셀 컬럼이 3개뿐이라 대부분 필드 미해결(06시 수집 지침 보완 필요) · DDCT 열밀림(08-03은 4건만 수집) · KITL 08-03 헤더 변형 경고(터미널 공표 양식 변경 가능성, 추적 중)
