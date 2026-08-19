-- 선사 출항 정시율 재생성 쿼리 (js/data_reliability.js 원천 — 2026-08-19 고도화 P7)
-- 실행: ELVIS_TWSC 스키마. 결과를 js/data_reliability.js 의 rows 에 반영하고 asOf 갱신.
-- 기준: ETD(확정 스케줄) vs ONBD_YMD(실제 선적) · 정시 = |편차| ≤ 1일 (Sea-Intelligence
--       GLP 의 ±1일 창을 출항 측에 적용) · |편차| ≤ 30일(입력 오류 배제) · 컨테이너 F/L.
-- 주의: LINE_CD 는 병합 필수 — 미병합 시 순위가 왜곡된다. SITC 코드는 미확인(확인 시 추가).
SELECT GRP, COUNT(*) N,
       ROUND(100*SUM(CASE WHEN ABS(D) <= 1 THEN 1 ELSE 0 END)/COUNT(*),1) ONTIME,
       ROUND(100*SUM(CASE WHEN D > 1 THEN 1 ELSE 0 END)/COUNT(*),1) LATE_PCT,
       ROUND(AVG(CASE WHEN D > 1 THEN D END),1) LATE_AVG,
       ROUND(100*SUM(CASE WHEN D < -1 THEN 1 ELSE 0 END)/COUNT(*),1) EARLY_PCT
FROM (
  SELECT CASE
    WHEN LINE_CD IN ('LHAPAG','LHAPAG1','LHAPAGT') THEN 'HLCU'
    WHEN LINE_CD IN ('LZIM01','LZIM')              THEN 'ZIMU'
    WHEN LINE_CD IN ('LCOSCO','LCO')               THEN 'COSU'
    WHEN LINE_CD IN ('LCMA','LCNCL')               THEN 'CMDU'
    WHEN LINE_CD IN ('LMAERS','LMCC')              THEN 'MAEU'   -- 머스크+씨랜드
    WHEN LINE_CD = 'LONE'   THEN 'ONEY'
    WHEN LINE_CD = 'LHDMU'  THEN 'HDMU'
    WHEN LINE_CD = 'LMSC'   THEN 'MSCU'
    WHEN LINE_CD = 'LKMTC'  THEN 'KMTC'
    WHEN LINE_CD = 'LYML'   THEN 'YMLU'
    WHEN LINE_CD = 'LEVER'  THEN 'EGLV'
    WHEN LINE_CD = 'LSML01' THEN 'SMLM'
    WHEN LINE_CD = 'LSIK'   THEN 'SNKO'   -- 장금상선
    WHEN LINE_CD = 'LHALN'  THEN 'HASL'   -- 흥아라인
  END GRP,
  TO_DATE(ONBD_YMD,'YYYYMMDD') - TO_DATE(ETD,'YYYYMMDD') D
  FROM ELVIS_TWSC.FMS_MBL_MST
  WHERE CNTR_TYPE IN ('F','L') AND ONBD_YMD IS NOT NULL AND ETD IS NOT NULL
    AND LENGTH(ONBD_YMD)=8 AND LENGTH(ETD)=8
    AND ONBD_YMD BETWEEN '20240101' AND '20261231' AND ETD BETWEEN '20240101' AND '20261231'
) WHERE GRP IS NOT NULL AND ABS(D) <= 30
GROUP BY GRP HAVING COUNT(*) >= 100 ORDER BY ONTIME DESC;
