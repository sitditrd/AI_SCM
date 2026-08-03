# TWL 물류 포털 — 개발 이력 전체 정리

작성일 2026-07-27 · 최종 개정 2026-08-03 (v1.7) · 저장소 https://github.com/sitditrd/AI_SCM · 문의 itt@twsc.co.kr

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

## 2. 최종 기능 (8개 화면, 전부 실데이터)

| 화면 | 기능 | 데이터 소스 | 배포판 동작 |
|---|---|---|---|
| index | 서비스 소개(사업영역 6+디지털 6) · TW-PFS 스트립 · 운임지수 스트립 | Supabase | ✅ |
| insight | TW-PFS v2 게이지·분포·권역·지도·Top10 | IMF PortWatch(위성 AIS) | ✅ |
| berth | 16개 터미널 선석배정(07-29 확대), 필터/검색, 반입마감 임박 강조, 항만 기상, ETA 지연 리스크, 그리드 UX(페이지네이션·연속 스크롤·컬럼 필터·트리 그리드·우클릭 퀵뷰) | 터미널 공표+Open-Meteo | ✅ |
| schedule | 해외 스케줄 허브 — Ship Schedule 3뷰(Route·Vessel·Port), 해외 터미널 현황(준비중 기획 공개), 국내/해외 탭 | LOCODE 기반(소스 확정 전) | ✅ (준비중 안내) |
| vessel | 실시간 AIS 지도(4개 항만), 선명/항차 검색→터미널 확대 이동, VesselFinder 연동, PORT-MIS 입출항 실적 조회, 자체 AIS 수신 지도(Leaflet, 5분 재조회) | VesselFinder+선석 DB+PORT-MIS(Edge Function datago)+vessel_positions(AISStream) | ✅ (PORT-MIS는 키 대기) |
| cargo | MBL/HBL/AWB 통관 진행 조회(유니패스), 선사·항공사 자동 감지 딥링크 | 관세청 유니패스 | 안내(로컬 전용) |
| route | 해상 항로+소요일 몬테카를로(P10/P50/P90, 히스토그램, 지도) | searoute 사전계산 8,556구간 | ✅ |
| status | 종합 판정·흐름도·신선도 게이지·7일 타임라인(적재 실적 기준)·이력·외부 연동 헬스체크 | berth_daily_counts·bs_collect_log 등 + Edge Functions·Open-Meteo | ✅ |

## 3. 데이터 파이프라인·자동화

- **스케줄러 7종(2026-08-03 기준)**

| # | 시각 | 이름 | 실행 주체 | 하는 일 | 산출물 |
|---|---|---|---|---|---|
| ① | 매일 06:00 | Terminal schedule collection | Cowork 앱 | 터미널 16곳 수집 → 통합 엑셀 + 리포트 메일 | `D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_YYYYMMDD.xlsx` |
| ② | 매일 07:30 | TWL_BerthUpload | **Windows 작업 스케줄러** | `scripts/run_berth_upload.bat` → `upload_berth_sql_parts.py --rest --today`(REST 직접 적재) | bs_vessel_calls + bs_collect_log |
| ③ | 매일 08:03 | berth-upload-supabase | Claude 앱 | 최근 7일 건수 비교로 미적재·부분적재 자동 복구(②의 안전망) | 동일 |
| ④ | 매일 08:44 | portinsight-daily-update | Claude 앱 | PortWatch → PCI 재산출 + pi_history 일별 append | pi_ports · pi_snapshot · pi_history |
| ⑤ | 매시 30분 | ais-positions-collect | Claude 앱 | AISStream 웹소켓 90초 수신 스냅샷 | vessel_positions(48h 보존) |
| ⑥ | 6시간마다 | weather-history-collect | Claude 앱 | Open-Meteo 파고·풍속 이력 | weather_history |
| ⑦ | 월·금 17:02 | freight-index-update | Claude 앱 | KCCI·SCFI·CCFI | freight_index |

- ②가 주 경로(앱 기동 여부와 무관하게 정시 보장), ③이 안전망 — 둘 다 동일 수집일 replace(멱등)라 중복 실행이 안전. ④를 ② 뒤에 두는 이유는 부산·광양·인천 접안/대기 척수를 당일 선석 실측으로 보정하기 때문
- **키 보관**: `SUPABASE_SERVICE_KEY`·`AISSTREAM_API_KEY` 사용자 환경변수 등록 완료(②·⑤ 가동) — 키 미보관 원칙에서 ②만 예외적으로 PC 보관. `UNIPASS_API_KEY`(Edge Function track)·`DATA_GO_KR_KEY`(Edge Function datago)는 미등록 대기이며 등록 즉시 코드 수정 없이 동작. 수집 스크립트의 `env_key()`가 환경변수 미상속 시 Windows 사용자 환경변수 레지스트리에서 키를 직접 읽음(setx 직후 재시작 불필요)
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
- (08-03) `run_berth_upload.bat` **ASCII 전용 유지 필수** — cmd.exe가 .bat를 콘솔 코드페이지로 파싱해 한글이 섞이면 줄이 깨지고 작업이 "성공(결과 0)"으로 끝나면서 아무 일도 하지 않음(실측 장애)

## 6. 남은 과제
1. ~~`SUPABASE_SERVICE_KEY`(sb_secret) → Windows 스케줄러 활성~~ **완료(2026-08-03)** — 사용자 환경변수 등록으로 ② TWL_BerthUpload 07:30 REST 직접 적재 가동
2. `UNIPASS_API_KEY`(Edge Function track) → 화물 추적 실조회(통관 타임라인) · `DATA_GO_KR_KEY`(Edge Function datago) → PORT-MIS 입출항 실적 조회 — 둘 다 미등록 대기, 등록 즉시 코드 수정 없이 동작
3. ~~AISStream 무료 키 → 자체 AIS 레이어~~ **키 등록·수신 PoC 완료(2026-08-03)** — vessel_positions 매시 30분 축적 중, 묘박지 대기 실측 활용은 이력 축적 후
4. ORS 키 → 내륙 운송 경로 최적화 탭(제안 ③)
5. KCCI 파서 보완(KOBC 그리드 비동기) · Figma 편집 좌석(기획 이관)
6. v3 지표: UNCTAD 선석점유율+Erlang C·CPPI형 생산성(방법론 실데이터 검증 완료, 이력 축적 후)
7. **React+TypeScript(Vite) 전환 — 채택 보류(app/ 제거), 운영은 정적본 유지 (2026-07-28)**: 검토 결과 채택 보류하고 app/ 폴더를 저장소에서 제거(git 이력엔 보존). 사유는 SEO 후퇴·번들 무게·빌드/인수인계 복잡도이며, 정적본 대비 사용자 체감 이점이 없어 운영본은 바닐라 정적 사이트(HTML/JS)로 유지(빌드 불필요).
8. **(07-28 신규) 화물 추적 무료 API 확충**: UNIPASS 외 공공데이터포털·해외 무료 API·선사 공개 조회 조사 결과 반영 (해상 우선 → 항공)
9. **(07-28 발견) 스케줄 캐치업 실행 시 적재 미반영 점검**: 07-28 06시대 미실행 → 08:38 지연 실행됐으나 pi_*·bs_collect_log 미갱신, 원인 조사 필요 (당일분은 수동 실행으로 보정 완료)
10. **(08-03 알려진 이슈) 터미널 파서**: PNCT는 원본 엑셀 컬럼이 3개뿐이라 대부분 필드 미해결(06시 수집 지침 보완 필요) · DDCT 열밀림(08-03은 4건만 수집) · KITL 08-03 헤더 변형 경고(터미널 공표 양식 변경 가능성, 추적 중)
