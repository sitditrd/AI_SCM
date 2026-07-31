# TWL 물류 포털 — 상세기술서

버전 v1.1 · 2026-07-31 (v1.0: 2026-07-27) · 태웅로직스 IT

## 1. 시스템 아키텍처

```
[외부 데이터 소스]                         [배치 계층]                    [저장 계층]        [표현 계층]
터미널 사이트 16곳 ─(06:00 수집 엑셀)──▶ 선석 적재(08:03, 파서+MCP) ─▶ bs_vessel_calls ──▶ berth.html
IMF PortWatch(ArcGIS REST) ───────────▶ collect_portinsight_api.py ▶ pi_ports/snapshot ▶ insight.html
상하이해운거래소(JSON) ────────────────▶ collect_freight_index.py ──▶ freight_index ───▶ index.html 스트립
Open-Meteo Marine ────────(브라우저 직접 fetch, CORS)──────────────────────────────────▶ berth.html 기상카드
VesselFinder AIS ─────────(iframe 임베드)─────────────────────────────────────────────▶ vessel.html
                                                                    bs_collect_log ──▶ status.html
```

- 프런트엔드: 순수 HTML/CSS/JS 정적 사이트(빌드 없음), Leaflet 지도, 45초 폴링.
- 저장소: Supabase PostgreSQL (프로젝트 kvmyiualdodcvreoqfin). 클라이언트는 publishable key + RLS(select만).
- 배치: Windows 파이썬 스크립트. 쓰기 경로 2중화 — ① REST(service_role 키) ② `--sql` 모드로 SQL 파일 생성 후 Supabase 연동(MCP)이 실행(키 불필요).

## 2. 데이터베이스 스키마

### 2.1 선석배정 (bs_*)
- **bs_terminals**(code PK, name_ko, port_ko, region_ord, website) — 터미널 마스터 16행 (2026-07-29 FR-02 확대)
- **bs_vessel_calls**(id, collected_date, terminal_cd FK, sub_terminal, berth, carrier, vessel_name, voyage, route, cct, eta, etd, work_start, work_end, discharge_qty, load_qty, shift_qty, status, raw jsonb, updated_at)
  - 인덱스: (collected_date desc), (terminal_cd, collected_date desc)
  - 적재: 동일 collected_date **delete 후 insert** (재실행 안전)
  - status: PLANNED/ARRIVED/WORKING/DEPARTED — 원본 상태 우선, 없으면 06:00 기준 시각 유추
- **bs_collect_log**(collected_date, file_name, total_rows, per_terminal jsonb, status, message, created_at)

### 2.2 Port Insight (pi_*)
- **pi_ports**(name_en/ko, country_cd, region_cd, lat/lng, tpfs, delay_h, waiting_cnt, berthed_cnt, updated_at) — Focus 93행
- **pi_snapshot**(id=1 단일행: total_ports, tpfs, critical_ports, global_risk, avg_delay_h, distribution jsonb, period_start/end)

### 2.3 운임지수
- **freight_index**(index_code, route, value, prev_value, pct_change, pub_date, unique(index_code,route,pub_date)) — upsert

RLS: 전 테이블 활성화, 익명은 select 정책만. 쓰기는 service_role 전용.

## 3. 수집 파이프라인 상세

### 3.1 선석배정 — scripts/collect_upload_berth.py
- 입력: `터미널 스케쥴 수집\터미널_선석배정현황_통합_YYYYMMDD.xlsx` (시트=터미널)
- 시트별 컬럼 매핑 테이블(MAP)로 이질 스키마 정규화. 특수 처리:
  - `선명(ROUTE)` 결합형 괄호 분리 (BNCT/DGT/E1CT/ICON)
  - Bitt 오프셋(`+10m` 등) 항로 오파싱 제거, `(null/null)` 항차 토큰 제거
  - ICON의 sub='E1' 행 제외 (E1CT 시트와 중복 방지)
- 출력: REST upsert 또는 `sql\upload_berth.sql`
- **과거분 백필**: `scripts/backfill_upload_berth.py` — 여러 날짜 파일 일괄 적재(수집일별 replace).
  기간 중 변경된 공표 양식(헤더 변형)을 VARIANTS 대응표로 자동 흡수: 줄바꿈/띄어쓰기 변형,
  컬럼 분리↔결합(모선항차/선사항차·선명/ROUTE·선박명/Bitt), `양하/적하/Shift` 통합 컬럼 분해,
  괄호 감싼 일시값 파싱. `--dry-run`(검증)·`--sql`(MCP 적재용)·REST 3모드.
  2026-07-31 보강: MAP 후보 리스트 지원·공백 위치 무시 매칭·`@@` 오염 토큰 제거·출처 푸터 행 필터.
  일일 스케줄 적재는 `scripts/upload_berth_sql_parts.py`(분할 SQL 생성) 경유 — 입력 위치 `D:\터미널 스케쥴 정보\`.

### 3.2 PCI v2 — scripts/collect_portinsight_api.py
- 원천: `Daily_Ports_Data` FeatureServer (services9.arcgis.com/weJ1QsnbMYJlCHdG, 무인증)
  - 쿼리: portid 8개 청크 × 최근 120일, `date >= DATE 'YYYY-MM-DD'`, 페이징(maxRecordCount 1000)
- 매핑: `scripts\portwatch_mapping.json` — Focus 93 ↔ portid (93/93, LA·롱비치 port664 공유)
- **산식**: PCI = 0.60×활동량백분위 + 0.25×물동량백분위 + 0.15×모멘텀
  - 활동량: 최근 7일 평균 portcalls가 120일 7일-이동평균 분포에서 차지하는 백분위
  - 물동량: (import+export) 동일 방식
  - 모멘텀: (최근7일−직전7일)/직전7일 → 시그모이드(k=6) 0~100
  - delay_h = (PCI/100)^1.5 × 48 (추정치), berthed = 최근 7일 평균 기항
  - **국내 보정**: 부산/광양/인천의 waiting·berthed는 bs_vessel_calls 실측으로 교체
- 스냅샷: 93개 집계(평균 tpfs, CONGESTED 수, 분포+전기대비 delta, 리스크 규칙: critical≥15 or avg≥60 → HIGH / ≥8 or ≥50 → MEDIUM / else LOW)
- 유의: PortWatch는 주 1회(화 09:00 ET) 배치, lag 약 7~10일

### 3.3 운임지수 — scripts/collect_freight_index.py
- SCFI/CCFI: `https://en.sse.net.cn/currentIndex?indexName={scfi|ccfi}` (무인증 JSON, Referer 헤더 필요, CORS 불가→배치 경유)
- 응답: `data.lineDataList[].{properties.lineName_EN, currentContent, lastContent, percentage}`
- KCCI: 미지원(KOBC 그리드 비동기 로딩) — 보완 과제

### 3.4 브라우저 직접 호출 (배치 불필요)
- 항만 기상: `marine-api.open-meteo.com/v1/marine?latitude=..&current=wave_height,wave_period` + `api.open-meteo.com/v1/forecast?...wind_speed_10m` (API 키 불필요·CORS 허용, 30분 갱신)
- 선박 위치: `vesselfinder.com/aismap.js` 임베드 — 전역 변수(latitude/longitude/zoom/names) 설정 후 스크립트 로드 → iframe 생성

## 4. 프런트엔드 구조

| 파일 | 역할 |
|---|---|
| common.js | 로고 주입(심볼+타이포), 테마(라이트/다크, localStorage), 헤더/리빌/카운트업/툴팁 |
| data.js | Port Insight 데이터 레이어 — Supabase 우선, 실패 시 정적 캐시(지터 없음)+오프라인 배너 |
| insight.js | 게이지·분포·권역·지도(Leaflet+CARTO)·순위 렌더. 리스크 배지 등급별 색상 |
| data_berth.js | 선석배정 레이어 — 최신 collected_date 조회(2단 쿼리), 시드 폴백, 값 정규화 방어 |
| berth.js | 필터(항만/터미널/상태)·검색·마감임박 강조·소계. 갱신 시 칩 카운트 재계산 |
| status.js | 운영 보드 — 판정 배너/흐름도/신선도 게이지/7일 타임라인/이력 |
| weather.js | Open-Meteo 기상 카드 (파고 등급: ≥2.5m 높음, ≥1.5m 주의) |
| landing.js | KPI 스트립(Supabase 모드에서만 표시), 운임지수 스트립, 히어로 캔버스 |

디자인 토큰: style.css `:root` (--brand-*, --lv-*, 라이트/다크 이중 정의). 선석배정 표는 table-layout:fixed 11컬럼 % 배분.

## 5. 운영

- **스케쥴**: 4종 체계(2026-07-31 재편, 윈도우 작업 스케줄러 미사용) — ① 06:00 Cowork 수집·메일 ② 08:03 선석 적재 ③ 08:44 PCI ④ 월·금 17:02 운임지수. 전부 `--sql` 생성 후 Supabase MCP 적재(키 미보관). 상세: `docs/06-operations/스케줄러_체계.md`
- **모니터링**: status.html — 이상 시 조치: ①수집 파일 확인 ②스케쥴 이력 ③수동 재적재 ④IT 문의. 외부 연동 헬스체크(SECTION 05): Edge Function track·datago(needKey→정상(키 대기))·send-code(OPTIONS)·Open-Meteo를 45초 주기 점검(응답시간 게이지 3초 기준·8초 타임아웃)
- **보안**: publishable key만 클라이언트 노출(RLS select-only). service_role 키는 환경변수 `SUPABASE_SERVICE_KEY` 전용, 저장소 커밋 금지
- **장애 폴백**: Supabase 불가 시 각 페이지는 마지막 시드(정적)로 표시 + 오프라인 배너, 45초마다 재연결 시도

## 6. 검증 이력 (2026-07-27)
- 선석배정 224건(중복 제거 후 223) 적재·표시 검증, 필터/검색/마감강조 E2E 통과
- PortWatch 실데이터 10,212행 → PCI v2 93개 산출·반영, 화면 배지/게이지/기간 확인
- Supabase 보안 어드바이저 0건, 콘솔 오류 0건, 라이트/다크·회사명·이메일(itt@twsc.co.kr) 통일
- 방법론 사전 검증: UNCTAD BOR+Erlang C(PNIT ρ=0.86, Wq≈65h 등), CPPI형 생산성(HJNC 83.6 moves/h 등) — v3 후보
