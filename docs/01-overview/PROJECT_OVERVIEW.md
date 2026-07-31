# TWL 물류 포털 — 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 태웅로직스 사내 물류 포털 (TWL Control Tower) |
| 기간 | 2026-07-24 ~ 2026-07-31 (완료, 운영 중) |
| 저장소 | https://github.com/sitditrd/AI_SCM |
| 배포 | GitHub Pages https://sitditrd.github.io/AI_SCM/ + Netlify (미러) |
| 로컬 실행 | `start_server.bat`(또는 `python server.py`) → http://localhost:8090 |
| 문의 | itt@twsc.co.kr |
| 문서 갱신 | 2026-07-31 |

## 1. 프로젝트 목표
매일 아침 담당자가 터미널 사이트 9곳(이후 16곳으로 확대)을 돌며 수작업으로 취합하던 선석배정현황과,
데모 수치에 머물던 항만 혼잡도 정보를 **전부 실데이터 자동 파이프라인**으로 전환하고,
선박 위치·운임지수·항만 기상·화물 추적·경로 분석까지 무료 오픈 API로 확장한 사내 물류 포털을 구축한다.

## 2. 단계별 진행 경과

| 단계 | 내용 | 산출물 |
|---|---|---|
| 1. 선석배정 파이프라인 | 통합 엑셀(9개 터미널, 시트별 이질 스키마) 분석 → 공통 스키마 정규화 → Supabase 적재 → 대시보드 | berth.html, scripts/collect_upload_berth.py, PRD |
| 2. Port Insight 실데이터 전환 | 오픈 API 6종 비교(멀티에이전트, 실호출 검증) → IMF PortWatch 선정 → Focus 93개 항만 매핑(93/93) → PCI v2 산출 | scripts/collect_portinsight_api.py, 개발계획서 |
| 3. 실운용 재가공 | 전 파일 감사(89건) → 데모 문구·가짜 난수 분석 제거, 공식 CI 로고 적용, 실서비스 기준 개편 | 전 페이지 |
| 4. 오픈 데이터 확장 | 6개 영역 전수 조사(41건) → 선박 위치(AIS)·운임지수(SCFI/CCFI)·항만 기상(Open-Meteo) 구현 | vessel.html, scripts/collect_freight_index.py, weather.js |
| 5. 운영 체계 | 데이터 현황 운영 보드(판정 배너·흐름도·신선도·7일 타임라인), 자동화 스케쥴 구축 | status.html |
| 6. 고도화 (07-28) | 용어 전문화(TW-PFS→PCI), 라이트 테마 전면 수리, 선석배정 14일 백필(3,218건), 선석배정 그리드 UX(페이지네이션·연속 스크롤·컬럼 필터·트리 그리드·우클릭 퀵뷰), 선박 위치 터미널 확대 이동 완성 | 전 페이지, scripts/backfill_upload_berth.py |
| 7. 배포·화면 확장 (07-28) | GitHub Pages 자동 배포 전환, 폴더 계층화(css/js/assets), 화물 추적(UNIPASS 프록시)·경로 분석(몬테카를로)·해외 스케줄 허브(준비중) 화면 추가 | cargo.html, route.html, schedule.html, .github/workflows |
| 8. 인증·다국어·터미널 확대 (07-29) | 로그인/회원가입/관리자 승인(커스텀 인증, bcrypt)·이메일 인증코드(Edge Function), 미로그인 지연 blur 게이트, 홈 한/영/중 다국어, 선석배정 16개 터미널 확대(FR-02), 조회결과 우클릭 Excel 내보내기, Netlify 미러 배포 | login.html, admin.html, js/i18n.js, supabase\ |
| 9. 스케줄러 재편 (07-31) | 스케줄러 4종 체계 전환(Cowork 수집 1종 + Claude 앱 3종), 윈도우 작업 스케줄러 폐지, service 키 PC 미보관(--sql 생성 + Supabase MCP 적재), PCI 산출을 선석 적재 이후로 순서 조정 | 개발자가이드\스케줄러_체계.md, scripts/upload_berth_sql_parts.py |

## 3. 제공 기능

- **Port Insight** (insight.html) — Focus Port 93개 혼잡도. IMF PortWatch(위성 AIS) 기반 항만 혼잡도 지수 PCI(Port Congestion Index) v2, 매일 08:44 산출(부산·광양·인천은 선석배정 실측으로 보정). 게이지·분포·권역·지도·순위·포트 검색.
- **선석배정** (berth.html) — 부산신항·광양·인천 16개 터미널, 매일 06:00 수집·08:03 적재. 항만/터미널/상태 필터, 검색, 반입마감 12시간 임박 강조, 터미널 소계, 항만 기상 카드, 그리드 UX(페이지네이션·연속 스크롤·컬럼 필터·트리 그리드·우클릭 퀵뷰), 조회결과 우클릭 Excel(.xlsx) 내보내기. 이력 14일치 축적(백필)으로 ETA 지연 리스크 표본 확보.
- **선박 위치** (vessel.html) — VesselFinder 공개 AIS 실시간 지도. 부산신항/북항/광양/인천 전환.
- **화물 추적** (cargo.html) — UNIPASS 조회(로컬 백엔드 `server.py` 프록시 전용) + 선사/터미널 딥링크. 배포판은 백엔드 미연결 안내 표시.
- **경로 분석** (route.html) — 사전계산 항로 93건 기반 몬테카를로 소요일 분포, Voyager 지도 항로 시각화.
- **해외 스케줄** (schedule.html) — 준비중(기획 화면, 데이터 소스 확정 대기).
- **운임지수** (index.html 스트립) — KCCI·SCFI·CCFI 종합·항로별, 월·금 17:02 자동 수집.
- **데이터 현황** (status.html, 관리자 전용) — 종합 판정 배너, 파이프라인 흐름도, 소스 신선도 게이지, 최근 7일 적재 타임라인, 이력.
- **로그인·관리자** (login.html·admin.html) — 커스텀 인증(Supabase, bcrypt)·관리자 승인·이메일 인증코드 발송. 미로그인 사용자는 일정시간 뒤 주요기능 blur + 로그인 유도.
- **다국어** — 홈페이지 한/영/중 전환(우상단 스위처, js/i18n.js).

## 4. 자동화 스케쥴 (4종)

| 작업 | 시각 | 방식 |
|---|---|---|
| Terminal schedule collection (Cowork 앱) | 매일 06:00 | 터미널 16곳 웹 수집 → 통합 엑셀(`D:\터미널 스케쥴 정보\`) + 리포트 메일 |
| berth-upload-supabase (Claude 앱) | 매일 08:03 | 엑셀 파싱 → 분할 SQL 생성 → Supabase MCP 적재. 최근 7일 미적재 자동 캐치업 |
| portinsight-daily-update (Claude 앱) | 매일 08:44 | IMF PortWatch → PCI 재산출. 국내 3항은 선석 실측 보정 |
| freight-index-update (Claude 앱) | 월·금 17:02 | KCCI·SCFI·CCFI 수집 (발표 주기에 맞춤) |

윈도우 작업 스케줄러는 사용하지 않는다. service_role 키는 PC에 저장하지 않으며(.py는 SQL 파일만 생성), DB 쓰기는 Claude 세션이 Supabase MCP로 실행한다. 상세: `개발자가이드\스케줄러_체계.md`.

## 5. 폴더 구조

```
C:\Users\Administrator\Documents\내문서\1. 태웅로직스\3. 기타\11. 내외부강의\
05. 생성형 AI기반 데이터 분석 공급망 최적화(글로벌 무역,물류)\02. 프로젝트\AI_SCM\
├─ *.html                               웹 화면 8종 + login.html·admin.html
├─ css\ / js\ / assets\                 공통 스타일(라이트/다크 토큰)·데이터 레이어/렌더러/인증·로고
├─ routes\                              사전계산 항로 JSON 93건 (경로 분석용)
├─ server.py / start_server.bat         로컬 백엔드(8090) — UNIPASS·searoute 프록시(로컬 전용)
├─ scripts\                             수집기 4종 + SQL 분할 생성기 + 항만 매핑
├─ sql\                                 DB 셋업 SQL + 적재 SQL
├─ supabase\                            인증 스키마 + send-code Edge Function
├─ .github\workflows\                   push → GitHub Pages 자동 배포
└─ docs\                            프로젝트 문서
    ├─ PRD\                             제품 요구사항 (선석배정)
    ├─ 개발계획서\                       Port Insight 오픈 API 연계
    ├─ 개발이력\ / 개발자가이드\          전체 타임라인·인수인계·스케줄러 체계
    ├─ 프로젝트개요\                     본 문서
    ├─ 상세기술서\                       기술 상세 명세
    └─ 발표자료\ / 피드백리스트\ / 화면기획\  발표 PPT·요구사항 명세(SRS)·화면 기획
```

일일 수집 엑셀 입력은 저장소 밖 `D:\터미널 스케쥴 정보\`(스케줄러 ① 산출)에 쌓인다.

## 6. 남은 과제
1. 해외 스케줄 실데이터 — 데이터 소스 확정(스크래핑/OCR/공개 API)
2. 화물 추적 실조회 — `UNIPASS_API_KEY` 발급 (현재 로컬 프록시·딥링크)
3. AISStream 무료 키 발급 → 자체 AIS 레이어(묘박지 대기 척수 실측)
4. v3 지표: UNCTAD 선석점유율 + Erlang C 대기시간, CPPI형 생산성 (방법론 실데이터 검증 완료, 이력 축적 후 적용)
5. 라이트 테마 hero 밴드 폴리시, 모바일/반응형 QA, 접근성 심화 감사
