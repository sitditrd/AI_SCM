# 운영 런북 (RUNBOOK)

**v1.0 · 2026-07-31**

> TWL Control Tower 데이터 파이프라인 장애 시 **이 문서만 보고 조치**할 수 있도록 작성된 운영 런북.
> 체계 설명은 `docs/06-operations/스케줄러_체계.md`, 배포 상세는 `docs/05-development/GitHub_Pages_배포가이드.md` 참조.
> 전제: **PC가 켜져 있고 Cowork 앱·Claude 앱이 실행 중이어야 스케줄이 돈다.** 꺼져 있으면 다음 앱 실행 시점에 밀린 작업이 실행된다. 절전 모드 방지 옵션 유지.

---

## 1. 일일 정상 상태 기준

| 시각 | 작업 | 정상이라면 이렇게 되어 있어야 함 |
|---|---|---|
| 매일 06:00 | ① Cowork 앱 · Terminal schedule collection | `D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_YYYYMMDD.xlsx` 오늘자 파일 생성 + itt@twsc.co.kr 로 수집 리포트 메일 수신 |
| 매일 08:03 | ② Claude 앱 · `berth-upload-supabase` | `bs_vessel_calls` 에 오늘 수집일 데이터 적재(동일 수집일 replace) + `bs_collect_log` 에 SUCCESS 1건. 최근 7일 미적재 날짜는 자동 캐치업 |
| 매일 08:44 | ③ Claude 앱 · `portinsight-daily-update` | `pi_ports` 93건 · `pi_snapshot`(id=1) 의 `updated_at` 이 오늘로 갱신. 부산·광양·인천 접안/대기는 ②의 당일 실측으로 보정(그래서 ③은 반드시 ② 뒤) |
| 월·금 17:02 | ④ Claude 앱 · `freight-index-update` | `freight_index` 갱신 — KCCI 는 월요일, SCFI/CCFI 는 금요일 발표 주기 |
| 상시 | 웹 포털 | GitHub Pages(https://sitditrd.github.io/AI_SCM/) 접속 정상, 45초 폴링으로 DB 반영 |

### 확인 쿼리 (Supabase 대시보드 → SQL Editor)

```sql
-- 최근 적재 로그 7건 (가장 먼저 볼 것)
select * from bs_collect_log order by created_at desc limit 7;

-- 수집일별 적재 건수 추이 (건수 급감 여부)
select collected_date, count(*) from bs_vessel_calls
 group by collected_date order by collected_date desc limit 7;

-- 오늘 터미널별 건수 (특정 터미널 0건 여부 — 시나리오 3-c)
select terminal_cd, count(*) from bs_vessel_calls
 where collected_date = current_date group by terminal_cd order by terminal_cd;

-- PCI 갱신 확인 (updated_at 이 오늘이면 정상, period_end 는 원천 lag 로 7~10일 전이 정상)
select updated_at, period_start, period_end from pi_snapshot where id = 1;

-- 운임지수 최신 발표일 확인
select index_code, route, value, pct_change, pub_date, updated_at
  from freight_index order by pub_date desc, index_code limit 15;
```

---

## 2. 모니터링 위치 3곳

1. **Cowork 앱 › 예약된 작업** — ①(Terminal schedule collection)의 실행 이력·회차별 결과 보고
2. **Claude 앱 사이드바 › 예정됨** — ② `berth-upload-supabase` · ③ `portinsight-daily-update` · ④ `freight-index-update` 의 실행 이력·결과 보고
3. **포털 데이터 현황(status.html, 관리자 전용)** — https://sitditrd.github.io/AI_SCM/status.html — 파이프라인 최신성 게이지·최근 7일 적재 타임라인 (관리자 계정 로그인 필요)

---

## 3. 장애 시나리오별 조치

### 3-a. 오늘 xlsx 없음 (06시 수집 미실행)

- **증상**: `D:\터미널 스케쥴 정보` 에 오늘자 `터미널_선석배정현황_통합_YYYYMMDD.xlsx` 없음. 06시 리포트 메일 미수신. ②가 08:03에 파일 없음으로 캐치업만 수행하거나 실패.
- **원인 후보**: PC 꺼짐/절전 → Cowork 앱 미기동 · Cowork 앱이 실행 중이 아니었음 · 터미널 공표 사이트 장애.
- **조치 순서**:
  1. Cowork 앱 실행 → **예약된 작업 › Terminal schedule collection** 실행 이력 확인. 앱이 꺼져 있었다면 켜는 시점에 밀린 작업이 자동 실행되므로 완료까지 대기.
  2. 자동 실행이 안 되면 해당 작업을 수동(즉시) 실행.
  3. `D:\터미널 스케쥴 정보` 에 오늘자 xlsx 생성 확인.
  4. 08:03 이 이미 지났다면 §4 수동 재적재 실행 (②의 다음 회차를 기다려도 최근 7일 캐치업으로 적재됨).
  5. 재발 방지: Windows 절전 모드 해제 확인.

### 3-b. 적재 실패·건수 불일치

- **증상**: `bs_collect_log` 에 오늘 SUCCESS 없음, 또는 `total_rows` 가 평소 대비 급감. status.html 타임라인에 공백.
- **원인 후보**: Claude 앱 꺼짐(② 미실행) · 파트 SQL 일부만 실행됨(MCP 중단) · 원본 파싱 실패.
- **조치 순서**:
  1. **Claude 앱 › 예정됨 › `berth-upload-supabase`** 실행 이력·결과 보고 확인.
  2. §1 확인 쿼리로 `bs_collect_log` 의 `per_terminal`(JSON) 확인 — 특정 터미널이 0 또는 `MISSING` 이면 3-c로.
  3. 원인 무관하게 **§4 수동 재적재를 그냥 다시 실행**하면 된다 — 동일 수집일 delete 후 insert(멱등)라 중복 위험 없음.
  4. 재적재 후 §1 확인 쿼리로 건수 검증.

### 3-c. 헤더 변형으로 특정 터미널 0건 (미해결 필드 WARN 대응)

- **증상**: `per_terminal` 에서 특정 터미널만 0건/급감. 파서 실행 시 `YYYY-MM-DD <터미널>: 미해결 필드 ['voy', ...]` WARN 출력.
- **원인**: 터미널이 공표 양식(엑셀 헤더)을 변경 — 파서가 헤더를 못 찾음. (공백·줄바꿈 차이는 파서가 자동 흡수하므로, WARN 이 나면 글자 자체가 바뀐 것.)
- **조치 순서**:
  1. 진단 실행 (업로드 없음):
     ```
     python scripts\backfill_upload_berth.py --dry-run "D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_YYYYMMDD.xlsx"
     ```
     → 미해결 필드 WARN 으로 어느 터미널·어느 필드인지 확인.
  2. 원본 xlsx 를 열어 해당 시트의 **실제 헤더 문자열** 확인.
  3. 파서에 새 헤더 후보 추가 — 두 곳 중 하나:
     - `scripts\backfill_upload_berth.py` 의 **`VARIANTS`** 딕셔너리: 해당 터미널 코드 아래에 필드 키(`cct`/`eta`/`etd`/`ws`/`we`/`voy`/`vessel`/`carrier`/`route` 등)별 후보 문자열을 리스트에 추가.
       예) E1CT 반입마감 헤더가 또 바뀌면 → `'E1CT': {... 'cct': ['반입마감시한 (작업완료일시)', '반입마감시한', '<새 헤더>']}`
     - 또는 `scripts\collect_upload_berth.py` 의 **`MAP`** : 값이 리스트를 지원하므로 기본 후보에 추가 가능. 예) `'voy': ['선사항차(IN/OUT)', '선사항차', '<새 헤더>']`
     - 양하/적하/Shift 가 한 컬럼으로 합쳐진 새 표기는 `backfill_upload_berth.py` 의 **`COMBINED_QTY`** 리스트에 추가.
  4. 1의 `--dry-run` 을 재실행해 WARN 소멸·건수 정상 확인.
  5. §4 수동 재적재로 해당 날짜 재적재(replace 라 안전).

### 3-d. PCI 미갱신

- **증상**: insight 화면·status.html 의 PCI 기준일이 오래됨. `pi_snapshot.updated_at` 이 오늘이 아님.
- **원인 후보**: Claude 앱 꺼짐(③ 미실행) · IMF PortWatch API(ArcGIS) 일시 장애 · **원천 자체가 주간 배치 갱신·lag 7~10일**(이 경우 `period_end` 가 과거인 것은 정상 — §7).
- **조치 순서**:
  1. **Claude 앱 › 예정됨 › `portinsight-daily-update`** 실행 이력 확인.
  2. 수동 재산출:
     ```
     python scripts\collect_portinsight_api.py --sql
     ```
     → `sql\update_portinsight.sql` 생성 → Supabase 대시보드 SQL Editor 에서 실행.
  3. ②(선석 적재)가 그날 아직 안 돌았다면 먼저 §4로 선석을 적재한 뒤 실행할 것 — 부산·광양·인천 접안/대기 보정이 당일 실측을 쓰기 때문.
  4. §1 쿼리로 `pi_snapshot.updated_at` 갱신 확인.

### 3-e. 운임지수 미갱신

- **증상**: index/insight 화면 운임지수 발표일이 오래됨. `freight_index` 최신 `pub_date` 정체.
- **원인 후보**: ④는 **월·금에만** 실행됨(그 사이 정체는 정상) · Claude 앱 꺼짐 · KOBC(KCCI)/상하이해운거래소(SCFI·CCFI) 사이트 구조 변경 또는 장애.
- **조치 순서**:
  1. 발표 주기 먼저 확인 — KCCI 월요일·SCFI/CCFI 금요일 발표. 발표일 전이면 장애 아님.
  2. **Claude 앱 › 예정됨 › `freight-index-update`** 실행 이력 확인.
  3. 수동 수집:
     ```
     python scripts\collect_freight_index.py --sql
     ```
     → `sql\upload_freight.sql` 생성 → Supabase SQL Editor 에서 실행 (upsert 라 재실행 안전).
  4. 수집 자체가 0건이면 소스 사이트 구조 변경 가능성 — `scripts\collect_freight_index.py` 파서 점검 필요.

### 3-f. 사이트 접속 불가 (GitHub Pages 꺼짐)

- **증상**: https://sitditrd.github.io/AI_SCM/ 전체가 404 (Site not found).
- **원인 후보**: **저장소가 private 으로 전환**되어 무료 계정 Pages 가 꺼짐(최다 사례) · 배포 워크플로 실패.
- **조치 순서**:
  1. https://github.com/sitditrd/AI_SCM → Settings 에서 저장소가 **public 인지 확인** — private 이면 public 으로 전환. (**반드시 public 유지**가 운영 원칙)
  2. Settings → Pages → Build and deployment → **Source 를 `GitHub Actions` 로 재지정**.
  3. Actions 탭 → `Deploy to GitHub Pages` 워크플로를 **Run workflow(수동 실행)** 하거나 아무 커밋이나 push 하면 재배포됨.
  4. Actions 실행이 초록 체크인지 확인 → 30초~2분 후 접속 확인.
  5. 접속은 되는데 내용이 예전 것이면 브라우저 캐시 — `Ctrl+F5`.

### 3-g. Netlify 미러 실패 (크레딧 소진)

- **증상**: Netlify 미러 사이트만 미갱신, Netlify 대시보드에 "production deploys are paused" 배너. GitHub Pages(주 배포)는 정상.
- **원인**: Netlify 무료 빌드 크레딧 소진.
- **조치 순서**:
  1. **서비스 영향 없음** — 주 배포는 GitHub Pages 이므로 긴급 조치 불필요. 다음 결제 주기에 자동 재개된다.
  2. 미러 트리거 자체가 안 도는 경우: GitHub 저장소 → Settings → Secrets and variables → Actions 에 `NETLIFY_BUILD_HOOK` 시크릿 존재 확인, Actions 로그에서 "Netlify 빌드 트리거됨" 메시지 확인.
  3. 훅 URL 이 무효화됐다면 Netlify 대시보드에서 Build Hook 재생성 후 `NETLIFY_BUILD_HOOK` 시크릿 값 교체.

---

## 4. 수동 재적재 절차 (선석배정)

### 4-1. 당일(단일 날짜) 재적재 — 표준 경로

1. SQL 파트 생성 (파일명의 YYYYMMDD 를 대상 날짜로):
   ```
   python scripts\upload_berth_sql_parts.py "D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_YYYYMMDD.xlsx"
   ```
   → `%TEMP%\berth_sql_parts\` 에 생성:
   - `part_00.sql` — 동일 수집일 delete
   - `part_01.sql` ~ `part_NN.sql` — 120건 단위 insert
   - `part_99.sql` — `bs_collect_log` 기록
2. 각 파트를 **`part_00` → `part_01`… → `part_99` 순서대로** Supabase 에서 실행 — SQL Editor 에 붙여넣어 실행하거나, Claude 세션에서 Supabase MCP `execute_sql` 로 실행.
3. 재실행 안전(멱등) — 같은 날짜를 다시 돌려도 replace 되므로 중복되지 않는다.
4. §1 확인 쿼리로 건수·로그 검증.

### 4-2. 과거 다중 날짜 백필

1. (권장) 먼저 파싱 점검:
   ```
   python scripts\backfill_upload_berth.py --dry-run "D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_*.xlsx"
   ```
2. SQL 생성:
   ```
   python scripts\backfill_upload_berth.py --sql "D:\터미널 스케쥴 정보\터미널_선석배정현황_통합_*.xlsx"
   ```
   → `sql\backfill_berth.sql` 단일 파일 생성 (글롭 대신 파일 경로 여러 개 나열도 가능).
3. `sql\backfill_berth.sql` 을 Supabase SQL Editor 에서 실행 (수집일별 replace + 로그 포함).
4. §1 확인 쿼리로 날짜별 건수 검증.

> 참고: `SUPABASE_SERVICE_KEY` 를 환경변수로 설정하면 두 스크립트 계열 모두 REST 직접 적재도 가능하지만, **키를 PC에 저장하지 않는 것이 운영 원칙**이므로 `--sql` 경로를 표준으로 한다(§5).

---

## 5. 시크릿·키 관리

### 무엇이 어디에 있나

| 시크릿 | 보관 위치 | 용도 |
|---|---|---|
| `NETLIFY_BUILD_HOOK` | GitHub 저장소(sitditrd/AI_SCM) → Settings → Secrets and variables → Actions | Pages 배포 후 Netlify 미러 빌드 트리거 |
| `SMTP_HOST` · `SMTP_PORT` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | Supabase(kvmyiualdodcvreoqfin) → Project Settings → Edge Functions → Secrets | 가입 인증코드·비번찾기 메일 발송(send-code, 네이버 SMTP) |
| `UNIPASS_API_KEY` | Supabase → Project Settings → Edge Functions → Secrets | 화물 추적(UNIPASS) 조회 |
| service_role 키 | **PC 미보관 원칙** — 어디에도 저장하지 않음 | 스케줄러는 `--sql` 생성 후 Supabase MCP 로 적재하므로 불필요. 직접 REST 적재가 꼭 필요할 때만 일회성으로 `SUPABASE_SERVICE_KEY` 환경변수 설정 후 즉시 제거 |
| publishable key (`sb_publishable_…`) | 웹 소스에 포함(공개) | RLS 읽기 전용 — 노출되어도 무방, 로테이션 대상 아님 |

### 유출 시 로테이션 절차

1. **service_role 키 유출 의심**: Supabase 대시보드 → Project Settings → API → service_role 키 **재발급(rotate)**. PC·문서에 남은 사본이 없는지 확인(원칙상 없어야 정상).
2. **SMTP_PASS(네이버 앱 비밀번호) 유출**: 네이버 계정에서 해당 앱 비밀번호 폐기 → 새 앱 비밀번호 발급 → Supabase Edge Functions Secrets 의 `SMTP_PASS` 교체 → login.html 에서 인증코드 발송 테스트.
3. **NETLIFY_BUILD_HOOK 유출**: Netlify 대시보드 → Site settings → Build hooks 에서 기존 훅 삭제·재생성 → GitHub Secrets 의 `NETLIFY_BUILD_HOOK` 값 교체.
4. **UNIPASS_API_KEY 유출**: 관세청 UNIPASS 에서 키 재발급 → Edge Functions Secrets 교체.
5. 공통: 로테이션 후 §1 확인 쿼리와 해당 기능(메일 발송·미러 배포·화물조회)을 1회씩 실측 확인.

---

## 6. 스케줄 변경·중지 방법

- **② ③ ④ (Claude 앱)**: Claude 앱 사이드바 → **예정됨** → 해당 작업(`berth-upload-supabase` / `portinsight-daily-update` / `freight-index-update`) 선택 → 시각 수정 또는 **일시정지**. 작업이 수행하는 내용 자체를 바꾸려면 지침 파일 수정: `C:\Users\Administrator\.claude\scheduled-tasks\<작업ID>\SKILL.md`
- **① (Cowork 앱)**: Cowork 앱 → **예약된 작업** → Terminal schedule collection 선택 → 수정/일시정지.
- **순서 제약 주의**: ③(PCI)은 반드시 ②(08:03 선석 적재) **이후** 시각이어야 한다 — 부산·광양·인천 보정이 당일 실측을 사용(과거 07:04 → 08:44 로 조정된 이력 있음). ②를 늦추면 ③도 함께 늦출 것.
- 모든 적재는 멱등(동일 수집일 replace)이므로 일시정지 후 재개·중복 실행 모두 안전하다.

---

## 7. 알려진 이슈 (장애 아님 / 개선 대기)

| 이슈 | 내용 | 상태 |
|---|---|---|
| DDCT 원본 열밀림 | DDCT 시트는 원본 공표 단계에서 열이 밀려 들어오는 경우가 있음 — 파서가 아니라 **①(Cowork) 수집기 지침 수정이 필요** | 개선 대기 |
| PNCT 컬럼 한정 | PNCT 는 원본 공표 컬럼이 3개에 한정되어 나머지 필드는 비어 적재됨 — 원본 한계이며 수집기 결함 아님 | 원본 한계 |
| PortWatch lag 7~10일 | IMF PortWatch 원천이 주간 배치 갱신·약 7~10일 지연이라 `pi_snapshot.period_end` 가 항상 과거 날짜임 — **PCI 미갱신 장애와 혼동 금지**(§3-d), `updated_at` 이 오늘이면 정상 | 원천 특성 |
| E1CT/ICON 중복 | ICON 시트의 sub_terminal=E1 행은 E1CT 시트와 동일 기항이라 파서가 자동 제외 — ICON 건수가 원본보다 적어 보여도 정상 | 정상 동작 |

---

*TWL Control Tower · 태웅로직스 · itt@twsc.co.kr · 문서 위치: docs/06-operations/RUNBOOK.md*
