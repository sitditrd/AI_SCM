# PRD — 터미널 선석배정현황 통합 대시보드 (Berth Insight)

| 항목 | 내용 |
|---|---|
| 문서 버전 | v1.0 (초안) |
| 작성일 | 2026-07-27 |
| 작성 | 태웅로지스틱스 IT (Claude 협업) |
| 대상 시스템 | TWL SmartBPO 데모 웹사이트 (`C:\Temp\AI_SCM`) |
| 관련 문서 | 유첨1: `터미널 스케쥴 수집\터미널_선석배정현황_통합_20260727.xlsx` |

---

## 1. 배경 및 문제 정의

수출입 운영 담당자는 매일 아침 부산신항·광양항·인천항 **9개 컨테이너 터미널 웹사이트에 개별 접속**하여 선석배정현황(모선 접안/출항 일정, 반입마감시한, 양적하 물량)을 확인한다. 이 작업은:

- 터미널마다 사이트 UI·표기·컬럼 구조가 달라 **취합에 매일 30분~1시간** 소요된다.
- 반입마감시한(Cargo Cut-off)을 놓치면 **선적 실패(Roll-over)** 로 직결된다.
- 취합 결과가 개인 엑셀에 머물러 **팀 단위 공유·이력 관리가 안 된다**.

이미 구축된 자동화 1단계로, **Claude 스케쥴러가 매일 오전 6시에 각 터미널 사이트에 접속해 데이터를 수집**하고 통합 엑셀 1개 파일로 저장한다(유첨1). 본 PRD는 그 다음 단계인 **2단계: 엑셀 → Supabase 적재 → 웹 대시보드 제공**을 정의한다.

## 2. 목표 및 성공 지표

### 2.1 목표
1. 매일 06:00 수집된 선석배정현황을 **Supabase에 자동 적재**한다.
2. 기존 TWL SmartBPO 사이트에 **선석배정현황 대시보드 페이지(berth.html)** 를 추가하여, 접속 즉시 전 터미널 현황을 한 화면에서 확인하게 한다.
3. 기존 Port Insight와 동일한 UX 패턴(45초 자동 갱신, Supabase 실데이터 + 내장 시드 폴백)을 유지한다.

### 2.2 성공 지표 (KPI)
| 지표 | 현재 | 목표 |
|---|---|---|
| 일일 현황 취합 소요 시간 | 30~60분/인 | 0분 (자동) |
| 데이터 최신성 | 담당자 확인 시점 | 매일 06:10 이내 적재 완료 |
| 반입마감 임박 건 식별 | 수작업 | 대시보드 자동 하이라이트 (12시간 이내) |
| 커버리지 | 담당자별 상이 | 9개 터미널 / 3개 항만 100% |

## 3. 사용자

| 페르소나 | 주요 니즈 |
|---|---|
| 운영(부킹/선적) 담당자 | 담당 모선의 접안·출항 일정과 반입마감시한 즉시 확인 |
| 영업 담당자 | 고객 문의 시 특정 선박/항차의 터미널·일정 조회 |
| 운영 관리자 | 항만·터미널별 물량(양하/적하) 및 혼잡 추이 파악 |

## 4. 범위

### 4.1 In Scope (v1)
- 통합 엑셀 파싱·정규화 및 Supabase 적재 스크립트 (`collect_upload_berth.py`)
- Supabase 테이블 3종 신설 (`bs_terminals`, `bs_vessel_calls`, `bs_collect_log`)
- 대시보드 페이지 `berth.html` + 렌더러 `berth.js` + 데이터 레이어 `data_berth.js`
- 기존 페이지(index/insight) 내비게이션에 메뉴 추가

### 4.2 Out of Scope (v1 이후 검토)
- 터미널 사이트 크롤링 자체(1단계, Claude 스케쥴러 기 구축)
- 알림(카카오톡/메일) 발송, 담당자별 관심 선박 구독
- 일자별 이력 비교·지연 통계 분석 화면 (데이터는 이력 적재하므로 v2에서 가능)
- 모바일 전용 앱

## 5. 시스템 아키텍처 — 데이터 파이프라인

```
[매일 06:00] Claude 스케쥴러 (기 구축)
     │  부산신항 PNIT·PNC·HJNC·HPNT·BNCT·DGT / 광양 GWCT / 인천 E1CT·ICON 사이트 접속
     ▼
C:\Temp\AI_SCM\터미널 스케쥴 수집\터미널_선석배정현황_통합_YYYYMMDD.xlsx   (유첨1 형식, 시트=터미널)
     │
     ▼  [06:05] collect_upload_berth.py  (스케쥴러가 엑셀 저장 직후 실행)
     │   - 9개 시트 파싱 → 공통 스키마 정규화 (6.3절 매핑)
     │   - 상태 표준화 (PLANNED/ARRIVED/WORKING/DEPARTED)
     │   - Supabase REST upsert (service_role key, 환경변수 SUPABASE_SERVICE_KEY)
     │   - 결과를 bs_collect_log 에 기록
     ▼
Supabase (kvmyiualdodcvreoqfin)
     bs_terminals (터미널 마스터 9행) · bs_vessel_calls (일별 선석배정, 이력 누적) · bs_collect_log
     │
     ▼  REST (publishable key, RLS 읽기 전용) · 45초 폴링
berth.html — 선석배정현황 대시보드
     ※ Supabase 장애/오프라인 시 data_berth.js 내장 시드(최근 수집분)로 자동 폴백
```

## 6. 데이터 정의

### 6.1 원본(유첨1) 구조 — 2026-07-27 수집분 기준
시트 1개 = 터미널 1개. 터미널마다 컬럼 구성이 다르다(총 224건 정규화 확인).

| 시트 | 터미널 | 항만 | 건수 | 특이사항 |
|---|---|---|---|---|
| PNIT | 부산신항 1부두 (PNIT) | 부산신항 | 16 | `상태` 컬럼 제공, AMP 표기 |
| PNC | 부산신항 2부두 (PNC) | 부산신항 | 41 | 상태 없음, `줄잡이업체`·`업데이트일시` 제공 |
| HJNC | 부산신항 3부두 (한진) | 부산신항 | 31 | 상태 없음, 작업시작/완료일시 제공 |
| HPNT | 부산신항 4부두 (HPNT) | 부산신항 | 17 | `반입시작일시` 제공 |
| BNCT | 부산신항 5부두 (BNCT) | 부산신항 | 18 | `선명(ROUTE)` 결합 표기 |
| DGT | 부산신항 서컨 (동원글로벌) | 부산신항 | 54 | `모선명(Route)` 결합 표기, 상태 영문 혼용(Departed/Working/Planned) |
| GWCT | 광양항 서부컨테이너터미널 | 광양항 | 18 | 상태 없음, 작업시작/완료일시 제공 |
| E1CT | 인천 E1컨테이너터미널 | 인천항 | 9 | `선박명(Bitt)` 결합 표기 |
| ICON | 인천항 통합(선광·한진·ICT·E1·국제) | 인천항 | 20 | 시트 내 `터미널` 컬럼으로 하위 터미널 구분 |

### 6.2 공통 정규화 스키마 (bs_vessel_calls)
| 필드 | 타입 | 설명 | 원본 예 |
|---|---|---|---|
| collected_date | date | 수집일 (파일명 YYYYMMDD) | 2026-07-27 |
| terminal_cd | text | 터미널 코드 (시트명) | PNIT |
| sub_terminal | text | 하위 터미널 (ICON 전용) | 선광, 한진 |
| berth | text | 선석 | T2(P), B6, 2B |
| carrier | text | 선사 코드/명 | MSC, MAE, ONE |
| vessel_name | text | 선명 | MSC PROCIDA |
| voyage | text | 모선항차 | MSPC005 |
| route | text | 항로/서비스 | AN3E, GUSEC3 |
| cct | timestamptz | 반입마감시한 (Cargo Cut-off) | 2026-07-26 15:00 |
| eta | timestamptz | 접안(예정)/입항일시 | 2026-07-27 01:00 |
| etd | timestamptz | 출항(예정)일시 | 2026-07-29 00:00 |
| work_start / work_end | timestamptz | 작업 시작/완료 (제공 터미널만) | |
| discharge_qty | int | 양하 수량 (VAN) | 1884 |
| load_qty | int | 적하/선적 수량 (VAN) | 2500 |
| shift_qty | int | Shift/S/H | 0 |
| status | text | 표준 상태 (6.4절) | PLANNED |
| raw | jsonb | 원본 행 보존 (감사/디버깅) | |

### 6.3 시트별 컬럼 매핑 요약
- 선명: `선명`(PNIT·HPNT) / `모선명`(PNC) / `선박명`(HJNC·GWCT) / `선명(ROUTE)`·`모선명(Route)`·`선박명(Bitt)`(BNCT·DGT·E1CT·ICON, 괄호 분리 파싱)
- 반입마감: `반입마감시한` / `반입마감일시` / `반입마감시한(작업완료일시)`
- 접안/입항: `접안(예정)일시` / `접안예정일시` / `입항일시`
- 물량: `양하`·`적하` / `양하수량`·`선적수량` / `양하수량(VAN)`·`적하수량(VAN)`
- Shift: `Shift` / `S/H`

### 6.4 상태 표준화 규칙
1. 원본 `상태` 값이 있으면 대문자 통일: DEPARTED / ARRIVED / WORKING / PLANNED
2. `상태` 컬럼이 없는 터미널(PNC·HJNC·GWCT·E1CT·ICON)은 수집 기준시각(당일 06:00) 대비 시각으로 유추:
   - 작업완료일시 또는 출항일시 ≤ 기준시각 → **DEPARTED**
   - 접안/입항일시 ≤ 기준시각 → **WORKING**
   - 그 외 → **PLANNED**

## 7. 기능 요구사항

| ID | 요구사항 | 우선순위 |
|---|---|---|
| FR-01 | 매일 06:05 엑셀을 파싱하여 Supabase에 적재한다. 동일 수집일 재실행 시 중복 없이 갱신(replace)한다. | P0 |
| FR-02 | 대시보드는 최신 수집일 데이터를 기본 표시하고, 상단에 수집일·적재시각을 명시한다. | P0 |
| FR-03 | KPI 요약: 총 모선 수, 작업중(WORKING+ARRIVED), 반입마감 임박(기준시각+12h 이내), 금일 출항 예정 수. | P0 |
| FR-04 | 항만 필터(전체/부산신항/광양항/인천항) 및 터미널 탭(9개)으로 목록을 필터링한다. | P0 |
| FR-05 | 목록 테이블: 터미널, 선석, 선명/항차, 선사, 항로, 반입마감, 접안, 출항, 양하/적하, 상태 배지. 접안일시 오름차순 기본 정렬. | P0 |
| FR-06 | 선명·선사·항로·모선항차 텍스트 검색. | P1 |
| FR-07 | 반입마감시한이 임박(12h 이내)한 행은 경고색으로 하이라이트, 경과 건은 무채색 처리. | P1 |
| FR-08 | 45초 자동 갱신 + 수동 새로고침 버튼 + [Supabase 실데이터]/[내장 시드] 소스 배지 — Port Insight와 동일 패턴. | P0 |
| FR-09 | Supabase 미연결/테이블 없음 시 최근 수집분 내장 시드로 자동 폴백하고 배지로 알린다. | P0 |
| FR-10 | 터미널별 소계(모선 수·양하·적하 합계) 요약 표를 제공한다. | P1 |
| FR-11 | 기존 index/insight 페이지 내비게이션에 "선석배정" 메뉴를 추가한다. | P0 |

## 8. 비기능 요구사항

| 구분 | 내용 |
|---|---|
| 성능 | 일 300건 내외 적재, 페이지 로드 1초 내 렌더 (클라이언트 필터링) |
| 보안 | 클라이언트는 publishable key + RLS(select만 허용). **쓰기는 service_role key를 가진 적재 스크립트 전용**, 키는 환경변수 `SUPABASE_SERVICE_KEY`로만 주입하고 코드/저장소에 커밋 금지 |
| 가용성 | Supabase 장애 시에도 내장 시드로 화면 제공 (기능 저하 모드) |
| 이력 | `bs_vessel_calls`는 collected_date 기준 누적 적재 (일자별 이력 비교 v2 대비). 동일 수집일 재적재는 해당 일자 삭제 후 삽입 |
| 운영 | 적재 성공/실패를 `bs_collect_log`에 기록. 3회 연속 실패 시 담당자 점검 (v2: 알림 자동화) |
| 스케쥴 | Claude 스케쥴러: 06:00 수집 → 06:05 적재 스크립트 실행 (Windows 작업 스케줄러 또는 스케쥴러 후속 스텝) |

## 9. 데이터베이스 설계 (Supabase)

기존 `pi_*`(Port Insight)와 구분되는 `bs_*`(Berth Schedule) 네임스페이스. DDL 전문은 `setup_supabase_berth.sql`.

### 9.1 bs_terminals — 터미널 마스터 (9행 시드)
```sql
create table public.bs_terminals (
  code        text primary key,      -- PNIT/PNC/HJNC/HPNT/BNCT/DGT/GWCT/E1CT/ICON
  name_ko     text not null,
  port_ko     text not null,         -- 부산신항/광양항/인천항
  region_ord  int  not null,         -- 표시 순서
  website     text
);
```

### 9.2 bs_vessel_calls — 선석배정 현황 (일별 이력 누적)
```sql
create table public.bs_vessel_calls (
  id             bigint generated always as identity primary key,
  collected_date date not null,
  terminal_cd    text not null references public.bs_terminals(code),
  sub_terminal   text,
  berth          text,
  carrier        text,
  vessel_name    text not null,
  voyage         text,
  route          text,
  cct            timestamptz,
  eta            timestamptz,
  etd            timestamptz,
  work_start     timestamptz,
  work_end       timestamptz,
  discharge_qty  integer not null default 0,
  load_qty       integer not null default 0,
  shift_qty      integer not null default 0,
  status         text not null default 'PLANNED',  -- PLANNED/ARRIVED/WORKING/DEPARTED
  raw            jsonb,
  updated_at     timestamptz not null default now()
);
create index bs_vc_date_idx     on public.bs_vessel_calls (collected_date desc);
create index bs_vc_terminal_idx on public.bs_vessel_calls (terminal_cd, collected_date desc);
```

### 9.3 bs_collect_log — 적재 이력
```sql
create table public.bs_collect_log (
  id             bigint generated always as identity primary key,
  collected_date date not null,
  file_name      text,
  total_rows     integer not null default 0,
  per_terminal   jsonb,
  status         text not null,     -- SUCCESS / FAIL
  message        text,
  created_at     timestamptz not null default now()
);
```

### 9.4 RLS 정책
```sql
alter table public.bs_terminals    enable row level security;
alter table public.bs_vessel_calls enable row level security;
alter table public.bs_collect_log  enable row level security;
create policy "public read terminals" on public.bs_terminals    for select using (true);
create policy "public read calls"     on public.bs_vessel_calls for select using (true);
create policy "public read log"       on public.bs_collect_log  for select using (true);
-- insert/update/delete 정책 없음 → publishable key로는 쓰기 불가, service_role만 가능
```

## 10. 화면 설계 — berth.html

| 섹션 | 내용 |
|---|---|
| 헤더 | 기존 공통 헤더 + "선석배정" 활성 메뉴 |
| 타이틀 | "선석배정현황 — 국내 터미널 통합" · 수집일 표시 · 소스 배지 · 새로고침 버튼 |
| S1 KPI | 총 모선 / 작업·접안중 / 반입마감 임박(12h) / 금일 출항 예정 |
| S2 필터 | 항만 칩(전체·부산신항·광양항·인천항) + 터미널 탭(9) + 상태 칩 + 검색창 |
| S3 목록 | 선석배정 테이블 (FR-05) — 마감 임박 하이라이트 |
| S4 터미널 요약 | 터미널별 모선 수·양하·적하 소계 |
| 푸터 | 공통 푸터 + 데이터 출처 고지 |

디자인은 기존 `style.css` 토큰(라이트/다크, `lv-badge`, `kpi-grid`, `tw` 테이블)을 재사용한다.

## 11. 마일스톤

| 단계 | 산출물 | 상태 |
|---|---|---|
| M1 데이터 분석 | 유첨1 구조 분석·정규화 규칙 확정 | 완료 (2026-07-27) |
| M2 DB | `setup_supabase_berth.sql` 작성·실행 | SQL 작성 완료, SQL Editor 실행 필요 |
| M3 적재 | `collect_upload_berth.py` + 스케쥴 등록 | 스크립트 작성 완료, 키/스케쥴 등록 필요 |
| M4 화면 | berth.html/berth.js/data_berth.js + 기존 페이지 메뉴 | 완료 |
| M5 검증 | 실데이터 3일 연속 적재 확인 후 팀 공유 | 예정 |

## 12. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|---|---|---|
| 터미널 사이트 개편으로 수집 실패/컬럼 변경 | 해당 터미널 데이터 누락 | 시트별 매핑 테이블 분리 관리, 적재 시 누락 시트 로그·배지 표시 |
| 엑셀 미도착(수집 단계 실패) | 당일 데이터 없음 | 최신 수집일 데이터 유지 표시 + "n일 전 데이터" 경고 배너 |
| service_role key 유출 | DB 쓰기 권한 노출 | 키는 환경변수 전용, 저장소 커밋 금지, 유출 시 즉시 rotate |
| 터미널 데이터의 대외 제공 라이선스 | 상용화 제약 | 사내용 한정, 상용 제공 전 법무 검토 (기존 Port Insight와 동일 고지) |

## 13. 오픈 이슈
1. ICON(인천 통합) 시트의 하위 터미널 표기가 축약형(선광/한진/인천/E1/국제) — 정식 명칭 매핑 확정 필요.
2. 반입마감 "임박" 기준 12시간이 적정한지 운영팀 확인 필요.
3. 수집 시각(06:00) 외 일중 재수집(예: 14:00) 추가 여부.

---

### 유첨
- 유첨1: `터미널 스케쥴 수집\터미널_선석배정현황_통합_20260727.xlsx` — 9개 터미널 224건 (Claude 스케쥴러 06:00 수집본)
- 유첨2: `setup_supabase_berth.sql` — DB 스키마 + 시드
- 유첨3: `collect_upload_berth.py` — 일일 적재 스크립트
