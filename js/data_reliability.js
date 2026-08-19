/* 선사 출항 정시율 — 자사 선적 실적 기준 (2026-08-19 고도화 P7)
   생성: scripts/build_reliability.sql 을 ELVIS_TWSC 에 실행해 재생성한다(분기 1회 권장).
   기준: ETD(확정 스케줄) vs ONBD_YMD(실제 선적일) · 정시 = |편차| ≤ 1일 ·
         |편차| ≤ 30일 표본만(입력 오류 배제) · 기간 2024-01 ~ 2026-08 · 컨테이너 F/L.
   방법론: Sea-Intelligence GLP 의 ±1일 창을 출항 측에 적용. 도착(ATA)은 ELVIS 에
   실적 필드가 없어 산출 불가 — bl_snapshot 축적 후 도착 정시율은 차기(설계서 §8).
   SITC 는 LINE_CD 미확인으로 이번 판에서 제외. */
window.TWL_RELIABILITY = {
  asOf: '2026-08-19',
  basis: 'ETD(확정 스케줄) vs 실제 선적일 · 정시 = ±1일 · 2024-01~2026-08 자사 선적 295k 중 유효표본',
  rows: [
    { scac: 'SMLM', name: 'SM상선',      n: 2288,  ontime: 94.4, late: 0.4,  lateAvg: 4.2, early: 5.2 },
    { scac: 'SNKO', name: '장금상선',    n: 15411, ontime: 94.4, late: 1.4,  lateAvg: 3.1, early: 4.2 },
    { scac: 'KMTC', name: '고려해운',    n: 10751, ontime: 94.2, late: 0.9,  lateAvg: 3.6, early: 4.9 },
    { scac: 'CMDU', name: 'CMA CGM',     n: 10753, ontime: 93.9, late: 1.4,  lateAvg: 4.1, early: 4.7 },
    { scac: 'MAEU', name: '머스크',      n: 16508, ontime: 93.3, late: 2.5,  lateAvg: 4.6, early: 4.3 },
    { scac: 'HASL', name: '흥아라인',    n: 13162, ontime: 92.7, late: 0.7,  lateAvg: 3.3, early: 6.5 },
    { scac: 'COSU', name: 'COSCO',       n: 7312,  ontime: 92.1, late: 3.0,  lateAvg: 3.9, early: 4.9 },
    { scac: 'YMLU', name: 'Yang Ming',   n: 9170,  ontime: 91.7, late: 3.1,  lateAvg: 4.6, early: 5.2 },
    { scac: 'EGLV', name: 'Evergreen',   n: 6828,  ontime: 91.5, late: 3.7,  lateAvg: 4.4, early: 4.8 },
    { scac: 'HDMU', name: 'HMM',         n: 12596, ontime: 88.5, late: 5.2,  lateAvg: 3.8, early: 6.3 },
    { scac: 'HLCU', name: '하파그로이드', n: 8253,  ontime: 86.6, late: 2.4,  lateAvg: 4.1, early: 11.0 },
    { scac: 'MSCU', name: 'MSC',         n: 11157, ontime: 85.4, late: 10.5, lateAvg: 4.2, early: 4.1 },
    { scac: 'ONEY', name: 'ONE',         n: 11971, ontime: 85.4, late: 5.2,  lateAvg: 3.6, early: 9.4 },
    { scac: 'ZIMU', name: 'ZIM',         n: 3308,  ontime: 81.5, late: 1.8,  lateAvg: 2.9, early: 16.7 }
  ]
};
