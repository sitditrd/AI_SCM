# TWL 물류 포털 — 프로젝트 개요

| 항목 | 내용 |
|---|---|
| 프로젝트명 | 태웅로직스 사내 물류 포털 (TWL SmartBPO) |
| 기간 | 2026-07-24 ~ 2026-07-27 (v1 완료, 운영 중) |
| 저장소 | https://github.com/sitditrd/AI_SCM |
| 실행 | `start_server.bat` → http://localhost:8090 |
| 문의 | itt@twsc.co.kr |

## 1. 프로젝트 목표
매일 아침 담당자가 터미널 사이트 9곳을 돌며 수작업으로 취합하던 선석배정현황과,
데모 수치에 머물던 항만 혼잡도 정보를 **전부 실데이터 자동 파이프라인**으로 전환하고,
선박 위치·운임지수·항만 기상까지 무료 오픈 API로 확장한 사내 물류 포털을 구축한다.

## 2. 단계별 진행 경과

| 단계 | 내용 | 산출물 |
|---|---|---|
| 1. 선석배정 파이프라인 | 통합 엑셀(9개 터미널, 시트별 이질 스키마) 분석 → 공통 스키마 정규화 → Supabase 적재 → 대시보드 | berth.html, scripts/collect_upload_berth.py, PRD |
| 2. Port Insight 실데이터 전환 | 오픈 API 6종 비교(멀티에이전트, 실호출 검증) → IMF PortWatch 선정 → Focus 93개 항만 매핑(93/93) → TW-PFS v2 산출 | scripts/collect_portinsight_api.py, 개발계획서 |
| 3. 실운용 재가공 | 전 파일 감사(89건) → 데모 문구·가짜 난수 분석 제거, 공식 CI 로고 적용, 실서비스 기준 개편 | 전 페이지 |
| 4. 오픈 데이터 확장 | 6개 영역 전수 조사(41건) → 선박 위치(AIS)·운임지수(SCFI/CCFI)·항만 기상(Open-Meteo) 구현 | vessel.html, scripts/collect_freight_index.py, weather.js |
| 5. 운영 체계 | 데이터 현황 운영 보드(판정 배너·흐름도·신선도·7일 타임라인), 자동화 스케쥴 5종 | status.html |

## 3. 제공 기능 (전부 실데이터)

- **Port Insight** (insight.html) — Focus Port 93개 혼잡도. IMF PortWatch(위성 AIS) 기반 TW-PFS v2 지수, 매일 06시대 산출. 게이지·분포·권역·지도·순위.
- **선석배정** (berth.html) — 부산신항·광양·인천 9개 터미널, 매일 06:00 수집. 항만/터미널/상태 필터, 검색, 반입마감 12시간 임박 강조, 터미널 소계, 항만 기상 카드.
- **선박 위치** (vessel.html) — VesselFinder 공개 AIS 실시간 지도. 부산신항/북항/광양/인천 전환.
- **운임지수** (index.html 스트립) — SCFI/CCFI 종합·항로별, 주간 자동 수집.
- **데이터 현황** (status.html) — 종합 판정 배너, 파이프라인 흐름도, 소스 신선도 게이지, 최근 7일 적재 타임라인, 이력.

## 4. 자동화 스케쥴

| 작업 | 시각 | 방식 |
|---|---|---|
| berth-schedule-upload (Claude) | 매일 06:08 | 키 불필요 (--sql + Supabase 연동) |
| portinsight-open-api-update (Claude) | 매일 06:27 | 키 불필요 |
| freight-index-update (Claude) | 월 07시 | 키 불필요 |
| TWL_BerthUpload (Windows) | 매일 06:05 | sb_secret 키 필요 (예비) |
| TWL_PortInsightUpdate (Windows) | 매일 06:15 | sb_secret 키 필요 (예비) |

## 5. 폴더 구조

```
C:\Temp\AI_SCM\
├─ *.html / *.js / *.css / twl_*        웹 루트 (정적 사이트)
├─ start_server.bat                     로컬 서버(8090) 실행
├─ scripts\                             수집기 3종 + 항만 매핑
├─ sql\                                 DB 셋업 SQL + 수집기 생성 SQL
├─ PRJ_2026\                            프로젝트 문서
│   ├─ PRD\                             제품 요구사항 (선석배정)
│   ├─ 개발계획서\                       Port Insight 오픈 API 연계
│   ├─ 프로젝트개요\                     본 문서
│   └─ 상세기술서\                       기술 상세 명세
└─ 터미널 스케쥴 수집\                    일일 수집 엑셀 입력 폴더
```

## 6. 남은 과제
1. `SUPABASE_SERVICE_KEY`에 sb_secret 키 설정 → Windows 예비 스케쥴 활성화
2. KCCI(한국해양진흥공사) 파서 보완 — 그리드 비동기 로딩 대응
3. AISStream 무료 키 발급 → 자체 AIS 레이어(묘박지 대기 척수 실측)
4. v3 지표: UNCTAD 선석점유율 + Erlang C 대기시간, CPPI형 생산성 (방법론 실데이터 검증 완료, 이력 축적 후 적용)
