=====================================================
 태웅로직스 TWL SmartBPO — 사내 물류 포털
=====================================================

■ 실행 방법
  index.html 파일을 더블클릭하면 브라우저에서 바로 열립니다.
  (설치·빌드 불필요. Chrome/Edge 권장)

■ 파일 구성
  index.html    랜딩 페이지 (BPO 모듈 서비스 소개)
  insight.html  Port Insight 항만 혼잡도 대시보드 (IMF PortWatch 실데이터)
  berth.html    선석배정현황 대시보드 (부산신항·광양·인천 9개 터미널)
  status.html   데이터 현황 — 파이프라인 수집·적재 모니터링 (+ status.js)
  vessel.html   선박 위치 — 실시간 AIS 지도 (VesselFinder 임베드, 부산/광양/인천)
  weather.js    항만 기상 카드 (Open-Meteo Marine, 무키·브라우저 직접 호출)
  scripts\collect_freight_index.py  주간 해상운임지수 수집기 (SCFI/CCFI 무인증 JSON)
  style.css     공통 스타일 (라이트/다크 테마 토큰)
  data.js       데모 데이터 레이어 (Focus Port 93개 + 실시간 변동 시뮬레이션)
  data_berth.js 선석배정 데이터 레이어 (Supabase + 내장 시드 폴백)
  common.js     공통 스크립트 (로고/테마/애니메이션/툴팁)
  landing.js    랜딩 전용 스크립트
  insight.js    대시보드 렌더러 (45초 자동 갱신)
  berth.js      선석배정 렌더러 (필터/검색/마감 임박 강조)

■ 선석배정현황 (Berth Insight) — 2026-07-27 추가
  - 데이터 흐름: 매일 06:00 Claude 스케쥴러가 9개 터미널 사이트를 수집해
    "터미널 스케쥴 수집\터미널_선석배정현황_통합_YYYYMMDD.xlsx" 저장
    → 06:05 scripts\collect_upload_berth.py 가 파싱하여 Supabase 적재
    → berth.html 이 REST로 조회 (45초 폴링, 실패 시 내장 시드 폴백)
  - 최초 1회: Supabase SQL Editor에서 sql\setup_supabase_berth.sql 실행
    (bs_terminals / bs_vessel_calls / bs_collect_log 생성 + 2026-07-27 시드 224건)
  - 일일 적재 (2가지 경로, 하나만 있으면 됨):
    (A) Claude 스케쥴 작업 "berth-schedule-upload" (매일 06:08, 등록됨) —
        python scripts\collect_upload_berth.py --sql 로 sql\upload_berth.sql 생성 후
        Supabase 연결(MCP)로 실행. service key 불필요. 앱이 켜져 있어야 함.
    (B) Windows 작업 스케줄러 "TWL_BerthUpload" (매일 06:05, 등록됨) —
        환경변수 SUPABASE_SERVICE_KEY 설정 시에만 동작 (REST 직접 적재):
        python scripts\collect_upload_berth.py [YYYYMMDD]
  - 문서: PRJ_2026\PRD\PRD_터미널선석배정현황.md / .docx 참조

■ 인터넷 연결
  - 지도(Leaflet+CARTO 타일)와 Pretendard 폰트는 CDN에서 로드됩니다.
  - 오프라인이어도 지도 외 모든 기능은 동작합니다 (지도 영역에 안내 표시).

■ 실시간 동작
  - 대시보드는 45초마다 데이터가 자동 갱신됩니다 (KPI 플래시 + "n초 전 업데이트").
  - 우측 상단 [새로고침] 버튼으로 수동 갱신 가능.

■ Port Insight 오픈 API 연동 (2026-07-27 추가)
  - 원천: IMF PortWatch 오픈 API (portwatch.imf.org, 위성 AIS, 무료·인증 불필요)
  - 수집기: scripts\collect_portinsight_api.py — Focus 93개 항만의 일별 port calls로
    TW-PFS v2(활동량 60%+물동량 25%+모멘텀 15%) 산출 → pi_ports/pi_snapshot 갱신
    (부산·광양·인천 접안/대기 척수는 선석배정 bs_vessel_calls 실측으로 교체)
  - 매핑: scripts\portwatch_mapping.json (Focus 93 ↔ PortWatch portid, 93/93)
  - 스케쥴: Claude 작업 "portinsight-open-api-update"(06:27, 키 불필요) +
    윈도우 작업 "TWL_PortInsightUpdate"(06:15, sb_secret 키 필요)
  - 유의: PortWatch 원천은 주 1회 배치 갱신(약 7~10일 지연)
  - 문서: PRJ_2026\개발계획서\개발계획서_PortInsight_오픈API연계.docx

■ 신규 연동 (2026-07-27 2차 추가)
  - 선박 위치: VesselFinder 공개 AIS 임베드 (무료·무키) — vessel.html
  - 항만 기상: Open-Meteo Marine API (무료·무키·CORS) — 선석배정 페이지 카드
  - 운임지수: SCFI/CCFI (상하이해운거래소 무인증 JSON) → freight_index 테이블
    · Claude 스케쥴 작업 "freight-index-update" (월 07시, 주간 갱신)
    · KCCI(KOBC)는 그리드 비동기 로딩으로 미지원 — 추후 보완
  - 방법론 검증 완료(구현 대기): UNCTAD 선석점유율+Erlang C 대기시간,
    CPPI형 터미널 생산성(moves/h) — 선석배정 이력 축적 후 v3 적용

■ 로컬 서버 실행 (http://localhost:8090)
  - start_server.bat 더블클릭 → 브라우저 자동 오픈
  - (index.html 더블클릭 file:// 실행도 여전히 가능)

■ Supabase 실데이터 연동 (설정됨)
  - 프로젝트: https://kvmyiualdodcvreoqfin.supabase.co (data.js 상단에 URL/publishable key)
  - 최초 1회: Supabase 대시보드 > SQL Editor 에서 sql\setup_supabase.sql
    전체를 붙여넣고 Run → pi_ports(93행) / pi_snapshot 테이블 생성
  - 이후 insight.html을 열면 자동으로 Supabase에서 데이터를 읽어오며,
    상단에 [Supabase 실데이터] 초록 배지가 표시됩니다.
  - 테이블이 없거나 오프라인이면 자동으로 [내장 시뮬레이션] 모드로 폴백.
  - 데이터 수정: Supabase 대시보드 > Table Editor에서 pi_ports 값을 바꾸면
    45초 내 대시보드에 반영됩니다.
  - 보안: publishable key는 공개용(읽기 전용 RLS)이며, 쓰기는 대시보드/서버에서만 가능.

■ 운영 참고
  - 로고: 공식 CI 심볼을 사이트 팔레트(블루/틸)로 재채색(twl_symbol.png) +
    Taewoong Logistics 텍스트를 사이트 타이포그래피로 렌더. 파비콘 twl_logo.ico 동일 심볼
  - 브랜드 컬러 변경: style.css :root 변수 (--brand-*)
  - 데이터 대외 제공 시: 데이터 공급 계약·라이선스 검토 필요 (사내용은 무관)

© 2026 TAEWOONG LOGISTICS — 사내 운영용

■ 프로젝트 문서 (PRJ_2026\)
  프로젝트개요\PROJECT_OVERVIEW.md       전체 경과·기능·스케쥴·구조 요약
  상세기술서\상세기술서_TWL물류포털.md    아키텍처·스키마·산식·운영 상세
