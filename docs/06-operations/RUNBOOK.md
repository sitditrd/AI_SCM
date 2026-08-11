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
3. **포털 데이터 현황(status.html, 관리자 전용)** — https://sitditrd.github.io/AI_SCM/status.html — 파이프라인 최신성 게이지·최근 7일 적재 타임라인·외부 연동 헬스체크(Edge Function track/datago/send-code·Open-Meteo, 45초 주기) (관리자 계정 로그인 필요)

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

### 3-a2. 파일은 있는데 아침에 화면·DB에 오늘 데이터가 없음 (정시 누락)

- **증상**: `D:\터미널 스케쥴 정보` 에 오늘자 xlsx는 정상 생성됐는데, 08:03이 지나도 `bs_vessel_calls` 에 오늘 날짜가 없고 berth 화면이 전일 데이터를 표시.
- **원인**: ②는 **Claude 앱이 켜져 있어야 실행**된다. 08:03에 PC·앱이 꺼져 있으면 그 회차는 정시에 돌지 않고, 앱을 켜는 시점에 캐치업으로 실행된다. (2026-08-03 실측: 08-02·08-03 두 날짜분이 앱 기동 후 09:10~09:27에 함께 적재됨 — 데이터 유실은 아니고 **지연**이다.)
- **조치 순서**:
  1. Claude 앱을 켠다 → 예정됨에서 `berth-upload-supabase` 자동 캐치업 완료까지 대기(수 분). 급하면 해당 작업 "지금 실행".
  2. 즉시 필요하면 §4-1 수동 재적재.
  3. 확인: `SELECT collected_date, count(*) FROM bs_vessel_calls WHERE collected_date >= current_date - 3 GROUP BY collected_date ORDER BY 1 DESC;`
- **정시 보장(2026-08-03 적용 완료)**: Windows 작업 `TWL_BerthUpload` 가 **매일 07:30** `scripts\run_berth_upload.bat` 을 실행해 앱과 무관하게 적재한다(멱등이라 ②와 중복 안전). 로그 `logs/berth_upload.log` 에 `[OK] … 적재 완료` + `exit=0` 이면 정상. 등록·변경 절차는 `docs/06-operations/스케줄러_체계.md` §이중화.

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

### 3-f2. data.go.kr 조회 실패 (Edge Function `datago`)

- **증상**: vessel 화면의 PORT-MIS 입출항 실적 조회가 "조회 결과가 없습니다" 또는 키 안내 카드 표시. status.html SECTION 05 의 datago 카드가 주의/확인불가.
- **1차 확인** (브라우저 주소창에 그대로 입력 — 키 불필요):
  ```
  https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/datago?api=list
  ```
  `needKey: true` → 시크릿 미등록/삭제됨. `needKey: false` → 키는 살아 있음(아래 표로 원인 판별).
- **응답 코드별 원인·조치**:

| 응답 | 의미 | 조치 |
|---|---|---|
| `needKey: true` | `DATA_GO_KR_KEY` 시크릿 없음 | Supabase → Edge Functions → Secrets 에 재등록. **Decoding·Encoding 어느 형태든 무관**(함수가 정규화) |
| `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`(코드 30) | 키가 게이트웨이에 없음 | ① 신규 발급 직후면 반영까지 최대 1시간 대기 ② data.go.kr 마이페이지에서 해당 API 활용신청이 **만료(2028-08-03)** 되지 않았는지 확인 |
| `INVALID_REQUEST_PARAMETER_ERROR`(코드 11) | 파라미터명·형식 오류 | API.md §2.3 "업스트림 규격 파라미터" 표와 대조. 흔한 실수: 통계 3종은 **소문자 `sym`/`eym`**, PORT-MIS는 `sde`/`ede`(YYYYMMDD) |
| 코드 99 `Invalid parameter for function` | 인천항만공사 계열에 `pageNo` 전달됨 | 해당 별칭은 `paging: "row"`(skipRow/endRow)로 등록되어야 한다 — `ALIASES` 확인 |
| `NORMAL_SERVICE` 인데 `totalCount: 0` | 조회 조건에 해당 데이터 없음 | 인천항만 계열은 날짜가 **`YYYY-MM-DD` 하이픈 형식**이어야 한다(붙여 쓰면 오류 없이 0건) |
| `LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR` | 일 트래픽 초과(개발계정 10,000건/일) | 익일 자동 초기화. 상시 초과면 data.go.kr 에서 **운영계정 전환** 신청 |

- 별칭 추가·수정은 `supabase/functions/datago/index.ts` 의 `ALIASES` 만 고치고 재배포하면 되며, 화면 코드는 손대지 않는다.

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

## 4-3. `git push` 가 인증에 실패할 때 (2026-08-12 응급 수리 완료 — 기록 보존)

> **2026-08-12 수리됨**: `usr\bin\sh.exe`(2026-07 빌드, 구 DLL 과 불일치)를 같은 폴더의
> `bash.exe`(2024 빌드, DLL 과 짝이 맞음) 사본으로 교체했다. MSYS2 에서 sh.exe 는 원래
> bash 의 복사본이므로 동작 차이가 없다. 원본은 `sh.exe.broken-20260731` 로 백업.
> 이후 `git push` 정상 동작 확인. 단 `usr\bin` 의 다른 2026-07 빌드 유틸(patch·openssl 등)은
> 여전히 구 DLL 과 불일치 상태이므로, **한가할 때 Git for Windows 정식 재설치 권장**
> (모든 터미널·Claude 앱 종료 후 실행해야 DLL 이 교체된다). 재설치하면 백업 파일은 지워도 된다.
> `scripts/gh_push.py` 는 만일에 대비해 남겨둔다. 아래는 당시 진단 기록이다.

증상:

```
fatal: could not read Username for 'https://github.com'
```

원인은 자격증명이 아니라 **Git for Windows 설치본 손상**이다. `C:\Program Files\Git\usr\bin\sh.exe` 가 `STATUS_ENTRYPOINT_NOT_FOUND(0xC0000139)` 로 즉사한다 — 실행파일은 2026-07-10(Git 2.55.0) 인데 `msys-2.0.dll` 만 2024-05-02(3.4.10) 로 남아 업데이트 때 교체되지 않았다. git 은 **모든** 자격증명 헬퍼를 `sh -c` 로 띄우므로 gh·GCM 이 다 조용히 실패한다. 헬퍼 자체는 멀쩡해서 직접 실행하면 정상 응답한다.

진단:

```bash
"C:/Program Files/Git/usr/bin/sh.exe" -c "echo ok"
```

`ok` 가 안 나오면 이 문제다. 같은 이유로 훅·rebase 스크립트·submodule 도 깨져 있다.

**우회 — `gh` 는 sh 를 안 거치므로 멀쩡하다:**

```bash
python scripts/gh_push.py
```

GitHub Git Data API 로 blob → tree → commit → ref 순으로 올린다. author·committer·date·message·tree·parents 를 원본 그대로 복제하므로 **커밋 SHA 가 로컬과 완전히 일치**한다. 분기가 생기지 않고 fast-forward 로 붙으며, 끝나면 `git fetch` 까지 해서 로컬 `origin/master` 도 맞춘다. 토큰은 gh 가 처리하므로 스크립트가 다루지 않는다.

- 올리기 전에 계획만 보려면 `--dry-run`
- 브랜치·원격 지정은 `--branch` / `--remote`
- 각 단계에서 SHA 를 검증하고, 하나라도 어긋나면 **ref 를 갱신하지 않고 중단**한다
- 원격이 로컬 HEAD 의 조상이 아니면(즉 강제 푸시가 필요한 상황) 거부한다 — 먼저 fetch·rebase 할 것

**근본 해결**: Git for Windows 를 같은 버전으로 덮어 설치한다. 모든 Git Bash·MSYS 프로세스를 닫아야 DLL 이 교체된다. 복구 후에는 `git push` 를 쓰면 되고 이 스크립트는 필요 없다.

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
