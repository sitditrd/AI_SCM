/* =========================================================
   TWL Port Insight — Data Layer
   1) Supabase 실데이터 모드: pi_ports / pi_snapshot 테이블 조회
   2) 폴백: 내장 시드 + 실시간 변동 시뮬레이션
   ※ 테이블이 없거나 오프라인이면 자동으로 시뮬레이션 모드로 동작
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Supabase 접속 정보 ---------- */
  var SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv'; /* publishable key — 클라이언트 공개용(RLS 적용) */
  var SB_TIMEOUT_MS = 8000;

  /* ---------- 시드 난수 (틱마다 재현 가능한 변동) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 혼잡 레벨 기준 (원본 리포트 동일) ---------- */
  var LEVELS = {
    CONGESTED: { key: 'CONGESTED', ko: '혼잡', min: 75 },
    BUSY:      { key: 'BUSY',      ko: '주의', min: 50 },
    STABLE:    { key: 'STABLE',    ko: '안정', min: 25 },
    LOW:       { key: 'LOW',       ko: '원활', min: 0 }
  };
  function levelOf(tpfs) {
    if (tpfs >= 75) return 'CONGESTED';
    if (tpfs >= 50) return 'BUSY';
    if (tpfs >= 25) return 'STABLE';
    return 'LOW';
  }

  var REGIONS = {
    EA:    { ko: '동아시아',        en: 'East Asia' },
    SEA:   { ko: '동남아시아',      en: 'Southeast Asia' },
    SAME:  { ko: '남아시아·중동',   en: 'South Asia & Middle East' },
    EU:    { ko: '유럽',            en: 'Europe' },
    NA:    { ko: '북미',            en: 'North America' },
    LATAM: { ko: '중남미',          en: 'Latin America' },
    AF:    { ko: '아프리카',        en: 'Africa' },
    OC:    { ko: '오세아니아',      en: 'Oceania' }
  };

  /* ---------- Focus Port 96 시드 ----------
     [en, ko, 국가, 권역, lat, lng, TPFS, 접안지연(h), 대기척수, 접안척수] */
  function P(en, ko, cc, rg, lat, lng, t, d, w, b) {
    return { en: en, ko: ko, cc: cc, rg: rg, lat: lat, lng: lng, t: t, d: d, w: w, b: b };
  }
  var PORTS = [
    /* 동아시아 (17) + 러시아 극동 (3) */
    P('Shanghai', '상하이', 'CN', 'EA', 31.23, 121.49, 58, 21.4, 16, 68),
    P('Ningbo', '닝보', 'CN', 'EA', 29.87, 121.55, 54, 18.9, 12, 52),
    P('Shenzhen (Yantian)', '선전(옌톈)', 'CN', 'EA', 22.58, 114.27, 47, 14.2, 8, 44),
    P('Guangzhou (Nansha)', '광저우(난사)', 'CN', 'EA', 22.77, 113.60, 41, 12.1, 7, 38),
    P('Qingdao', '칭다오', 'CN', 'EA', 36.08, 120.32, 44, 13.5, 9, 41),
    P('Tianjin', '톈진', 'CN', 'EA', 38.98, 117.75, 39, 11.0, 6, 33),
    P('Xiamen', '샤먼', 'CN', 'EA', 24.47, 118.07, 33, 8.4, 4, 27),
    P('Dalian', '다롄', 'CN', 'EA', 38.93, 121.63, 21, 4.2, 2, 15),
    P('Hong Kong', '홍콩', 'HK', 'EA', 22.32, 114.13, 36, 9.6, 5, 30),
    P('Kaohsiung', '가오슝', 'TW', 'EA', 22.60, 120.28, 42, 12.8, 6, 28),
    P('Busan', '부산', 'KR', 'EA', 35.08, 129.04, 46, 13.9, 9, 47),
    P('Incheon', '인천', 'KR', 'EA', 37.45, 126.60, 28, 6.5, 3, 18),
    P('Gwangyang', '광양', 'KR', 'EA', 34.90, 127.70, 18, 3.1, 1, 12),
    P('Tokyo', '도쿄', 'JP', 'EA', 35.61, 139.79, 31, 7.4, 3, 21),
    P('Yokohama', '요코하마', 'JP', 'EA', 35.43, 139.68, 26, 5.8, 2, 17),
    P('Nagoya', '나고야', 'JP', 'EA', 35.03, 136.85, 22, 4.6, 2, 14),
    P('Kobe', '고베', 'JP', 'EA', 34.68, 135.20, 24, 5.1, 2, 15),
    /* 러시아 극동 3 — CIS·철도 연계 관문(2026-08-21 추가).
       현업 지적 "러시아 검색이 안 됨" 대응. 원천(IMF PortWatch)에는 러시아 항만이 48개
       수록돼 있고 데이터 지연도 부산과 동일한데(둘 다 최신 2026-08-14), 우리가 Focus 93 을
       고를 때 러시아를 한 곳도 넣지 않았던 것이 원인이었다 — 위성/제재 문제가 아니다.
       태웅 러시아 도착 물량은 도착국 6위이고 그중 97.7% 가 아래 세 항만에 몰려 있다.
       자루비노·슬라뱐카는 물량도 거의 없고 120일 중 99일·31일이 무활동이라 제외했다
       (넣으면 화면에 죽은 항만으로 보인다). 시드값은 폴백용이며 수집기가 실측으로 덮어쓴다. */
    P('Vladivostok', '블라디보스토크', 'RU', 'EA', 43.12, 131.89, 22, 4.4, 2, 11),
    P('Nakhodka', '나홋카', 'RU', 'EA', 42.81, 132.87, 15, 2.4, 1, 4),
    P('Vostochny', '보스토치니', 'RU', 'EA', 42.74, 133.07, 12, 1.8, 0, 2),
    /* 동남아시아 (15) */
    P('Singapore', '싱가포르', 'SG', 'SEA', 1.26, 103.83, 57, 20.6, 19, 74),
    P('Tanjung Pelepas', '탄중펠레파스', 'MY', 'SEA', 1.36, 103.55, 43, 13.1, 7, 31),
    P('Port Klang', '포트클랑', 'MY', 'SEA', 3.00, 101.39, 61, 24.7, 15, 42),
    P('Penang', '페낭', 'MY', 'SEA', 5.41, 100.34, 34, 8.9, 4, 16),
    P('Kuching', '쿠칭', 'MY', 'SEA', 1.56, 110.34, 38, 10.8, 4, 12),
    P('Jakarta (Tg. Priok)', '자카르타(탄중프리옥)', 'ID', 'SEA', -6.10, 106.89, 63, 26.3, 17, 39),
    P('Surabaya', '수라바야', 'ID', 'SEA', -7.20, 112.73, 49, 15.8, 8, 24),
    P('Laem Chabang', '람차방', 'TH', 'SEA', 13.08, 100.89, 45, 13.8, 8, 33),
    P('Bangkok', '방콕', 'TH', 'SEA', 13.70, 100.57, 52, 17.7, 9, 22),
    P('Ho Chi Minh (Cat Lai)', '호치민(깟라이)', 'VN', 'SEA', 10.78, 106.79, 59, 22.9, 14, 35),
    P('Cai Mep', '까이멥', 'VN', 'SEA', 10.53, 107.02, 40, 11.7, 6, 21),
    P('Haiphong', '하이퐁', 'VN', 'SEA', 20.86, 106.73, 55, 19.4, 10, 26),
    P('Manila', '마닐라', 'PH', 'SEA', 14.60, 120.96, 79, 41.6, 24, 28),
    P('Yangon', '양곤', 'MM', 'SEA', 16.78, 96.16, 82, 47.2, 21, 14),
    P('Sihanoukville', '시아누크빌', 'KH', 'SEA', 10.63, 103.50, 51, 16.9, 7, 13),
    /* 남아시아·중동 (14) */
    P('Colombo', '콜롬보', 'LK', 'SAME', 6.95, 79.85, 62, 25.4, 16, 36),
    P('Chattogram', '치타공', 'BD', 'SAME', 22.31, 91.80, 91, 68.5, 34, 22),
    P('Nhava Sheva (JNPT)', '나바셰바(JNPT)', 'IN', 'SAME', 18.95, 72.95, 53, 18.2, 11, 34),
    P('Mundra', '문드라', 'IN', 'SAME', 22.84, 69.71, 37, 10.2, 5, 27),
    P('Chennai', '첸나이', 'IN', 'SAME', 13.10, 80.30, 56, 19.9, 10, 25),
    P('Karachi', '카라치', 'PK', 'SAME', 24.80, 66.97, 84, 51.8, 27, 19),
    P('Jebel Ali', '제벨알리', 'AE', 'SAME', 25.01, 55.06, 35, 9.3, 6, 45),
    P('Khalifa (Abu Dhabi)', '칼리파(아부다비)', 'AE', 'SAME', 24.81, 54.64, 23, 4.9, 2, 19),
    P('Hamad', '하마드', 'QA', 'SAME', 25.01, 51.61, 19, 3.6, 1, 13),
    P('Dammam', '담맘', 'SA', 'SAME', 26.50, 50.20, 43, 12.9, 6, 20),
    P('Jeddah', '제다', 'SA', 'SAME', 21.48, 39.17, 48, 15.1, 9, 31),
    P('Salalah', '살랄라', 'OM', 'SAME', 16.95, 54.00, 27, 6.1, 3, 22),
    P('Bandar Abbas', '반다르아바스', 'IR', 'SAME', 27.14, 56.21, 77, 39.8, 18, 16),
    /* 유럽 (20) */
    P('Rotterdam', '로테르담', 'NL', 'EU', 51.95, 4.14, 49, 15.6, 12, 58),
    P('Antwerp-Bruges', '안트베르펜', 'BE', 'EU', 51.30, 4.30, 53, 18.4, 13, 49),
    P('Hamburg', '함부르크', 'DE', 'EU', 53.55, 9.93, 46, 14.1, 9, 38),
    P('Bremerhaven', '브레머하펜', 'DE', 'EU', 53.55, 8.58, 32, 8.1, 4, 24),
    P('Le Havre', '르아브르', 'FR', 'EU', 49.48, 0.11, 51, 16.8, 9, 27),
    P('Fos-Marseille', '포스-마르세유', 'FR', 'EU', 43.42, 4.86, 39, 11.2, 5, 19),
    P('Valencia', '발렌시아', 'ES', 'EU', 39.45, -0.32, 47, 14.6, 8, 29),
    P('Algeciras', '알헤시라스', 'ES', 'EU', 36.13, -5.44, 36, 9.8, 6, 33),
    P('Barcelona', '바르셀로나', 'ES', 'EU', 41.35, 2.16, 29, 6.9, 3, 20),
    P('Genoa', '제노바', 'IT', 'EU', 44.40, 8.92, 54, 18.8, 9, 23),
    P('Gioia Tauro', '조이아타우로', 'IT', 'EU', 38.44, 15.90, 31, 7.7, 4, 21),
    P('Trieste', '트리에스테', 'IT', 'EU', 45.62, 13.77, 26, 5.7, 2, 14),
    P('Koper', '코페르', 'SI', 'EU', 45.55, 13.73, 42, 12.5, 5, 16),
    P('Piraeus', '피레우스', 'GR', 'EU', 37.94, 23.63, 58, 21.7, 12, 31),
    P('Ambarli (Istanbul)', '암바를르(이스탄불)', 'TR', 'EU', 40.97, 28.68, 60, 23.5, 11, 25),
    P('Mersin', '메르신', 'TR', 'EU', 36.78, 34.64, 52, 17.4, 8, 19),
    P('Gdansk', '그단스크', 'PL', 'EU', 54.40, 18.66, 24, 5.2, 2, 16),
    P('Felixstowe', '펠릭스토', 'GB', 'EU', 51.95, 1.35, 45, 13.7, 7, 25),
    P('London Gateway', '런던게이트웨이', 'GB', 'EU', 51.50, 0.49, 30, 7.2, 3, 17),
    /* 북미 (12) */
    P('Los Angeles', 'LA', 'US', 'NA', 33.73, -118.26, 64, 27.1, 19, 51),
    P('Long Beach', '롱비치', 'US', 'NA', 33.75, -118.20, 61, 24.9, 16, 46),
    P('Oakland', '오클랜드', 'US', 'NA', 37.80, -122.32, 38, 10.6, 5, 22),
    P('Seattle-Tacoma', '시애틀-타코마', 'US', 'NA', 47.58, -122.35, 27, 6.2, 3, 18),
    P('Vancouver', '밴쿠버', 'CA', 'NA', 49.29, -123.11, 55, 19.6, 11, 29),
    P('New York/New Jersey', '뉴욕/뉴저지', 'US', 'NA', 40.67, -74.05, 50, 16.2, 11, 42),
    P('Savannah', '서배너', 'US', 'NA', 32.08, -81.09, 66, 28.9, 17, 33),
    P('Charleston', '찰스턴', 'US', 'NA', 32.78, -79.92, 37, 10.0, 5, 21),
    P('Houston', '휴스턴', 'US', 'NA', 29.73, -95.01, 57, 20.9, 12, 30),
    P('Manzanillo (MX)', '만사니요(멕시코)', 'MX', 'NA', 19.05, -104.31, 62, 25.6, 13, 24),
    P('Lazaro Cardenas', '라사로카르데나스', 'MX', 'NA', 17.95, -102.18, 41, 11.9, 6, 18),
    /* 중남미 (6) */
    P('Santos', '산투스', 'BR', 'LATAM', -23.95, -46.30, 76, 38.4, 22, 34),
    P('Callao', '카야오', 'PE', 'LATAM', -12.05, -77.15, 54, 18.6, 9, 21),
    P('Cartagena', '카르타헤나', 'CO', 'LATAM', 10.40, -75.53, 33, 8.6, 4, 23),
    P('Colon (Panama)', '콜론(파나마)', 'PA', 'LATAM', 9.36, -79.90, 48, 15.3, 9, 32),
    P('Buenos Aires', '부에노스아이레스', 'AR', 'LATAM', -34.60, -58.37, 75, 36.8, 16, 18),
    P('Guayaquil', '과야킬', 'EC', 'LATAM', -2.28, -79.91, 40, 11.5, 5, 15),
    /* 아프리카 (9) */
    P('Tanger Med', '탕헤르메드', 'MA', 'AF', 35.88, -5.50, 34, 8.8, 5, 28),
    P('Port Said', '포트사이드', 'EG', 'AF', 31.25, 32.30, 46, 14.0, 8, 26),
    P('Alexandria', '알렉산드리아', 'EG', 'AF', 31.20, 29.87, 78, 40.7, 17, 15),
    P('Durban', '더반', 'ZA', 'AF', -29.87, 31.03, 69, 31.5, 15, 20),
    P('Cape Town', '케이프타운', 'ZA', 'AF', -33.90, 18.43, 59, 22.4, 9, 14),
    P('Lagos (Apapa)', '라고스(아파파)', 'NG', 'AF', 6.44, 3.38, 88, 61.3, 29, 16),
    P('Mombasa', '몸바사', 'KE', 'AF', -4.07, 39.65, 81, 45.9, 19, 12),
    P('Dar es Salaam', '다르에스살람', 'TZ', 'AF', -6.82, 39.29, 85, 54.2, 23, 11),
    /* 오세아니아 (0... 아래) */
  ];
  /* 오세아니아 5 — 합계 96 유지용 별도 push */
  PORTS.push(
    P('Sydney (Botany)', '시드니(보터니)', 'AU', 'OC', -33.97, 151.22, 43, 12.7, 6, 19),
    P('Melbourne', '멜버른', 'AU', 'OC', -37.83, 144.93, 39, 10.9, 5, 17),
    P('Brisbane', '브리즈번', 'AU', 'OC', -27.38, 153.17, 25, 5.4, 2, 12),
    P('Auckland', '오클랜드(NZ)', 'NZ', 'OC', -36.84, 174.77, 47, 14.4, 6, 13)
  );

  /* ---------- 폴백 스냅샷 (마지막 실측치 — IMF PortWatch 2026-07-17 기준) ---------- */
  var NETWORK = {
    totalPorts: 96,
    tpfs: 37.7,
    criticalPorts: 15,
    globalRisk: 'HIGH',
    avgDelayHours: 13.5,
    distribution: [
      { level: 'LOW',       ratio: 39.8, count: 37, delta: +30 },
      { level: 'STABLE',    ratio: 33.3, count: 31, delta: -16 },
      { level: 'BUSY',      ratio: 10.8, count: 10, delta: -20 },
      { level: 'CONGESTED', ratio: 16.1, count: 15, delta: +6 }
    ],
    periodStart: '2026-07-11',
    periodEnd: '2026-07-17',
    reportDate: '2026-07-27'
  };

  /* ---------- 상태 산출 코어 ----------
     rawPorts: [{en,ko,cc,rg,lat,lng,t,d,w,b}] (시드 또는 Supabase 행)
     netOverride: 실데이터 스냅샷 (null이면 내장 NETWORK + 미세 변동)
     seed: 파생 난수 시드 / applyJitter: 시뮬레이션 변동 적용 여부 */
  function jitter(rand, base, pct) {
    return base * (1 + (rand() * 2 - 1) * pct);
  }

  function buildState(rawPorts, netOverride, seed, applyJitter) {
    var rand;
    /* 항만별 현재값 */
    var ports = rawPorts.map(function (src, idx) {
      rand = mulberry32(seed * 1000 + idx);
      var jt = Math.max(3, Math.min(97, jitter(rand, src.t, 0.035)));
      var jd = Math.max(0.5, jitter(rand, src.d, 0.05));
      var jw = Math.max(0, Math.round(src.w + (rand() * 4 - 2)));
      var jb = Math.max(1, Math.round(src.b + (rand() * 3 - 1.5)));
      var t = applyJitter ? jt : src.t;
      var d = applyJitter ? jd : src.d;
      var w = applyJitter ? jw : src.w;
      var b = applyJitter ? jb : src.b;
      var waitH = d * (0.55 + rand() * 0.35);           /* 접안 전 순번 대기 */
      var tsH = 8 + rand() * 20;                        /* 하역(서비스) 시간 */
      return {
        en: src.en, ko: src.ko, cc: src.cc, rg: src.rg,
        lat: src.lat, lng: src.lng,
        tpfs: Math.round(t * 10) / 10,
        level: levelOf(t),
        delayH: Math.round(d * 10) / 10,
        waitH: Math.round(waitH * 10) / 10,
        serviceH: Math.round(tsH * 10) / 10,
        twts: Math.round((waitH / tsH) * 100) / 100,
        waiting: w, berthed: b
      };
    });

    /* 글로벌 스냅샷 */
    var snap;
    if (netOverride) {
      snap = {
        totalPorts: netOverride.totalPorts,
        tpfs: netOverride.tpfs,
        tpfsGrade: null,
        criticalPorts: netOverride.criticalPorts,
        globalRisk: netOverride.globalRisk,
        avgDelayHours: netOverride.avgDelayHours,
        distribution: netOverride.distribution,
        periodStart: netOverride.periodStart,
        periodEnd: netOverride.periodEnd,
        reportDate: netOverride.reportDate
      };
    } else {
      /* 오프라인 캐시: 항만 배열에서 직접 집계해 화면 내 수치 모순 방지 */
      var byLv = { LOW: 0, STABLE: 0, BUSY: 0, CONGESTED: 0 };
      ports.forEach(function (x) { byLv[x.level] += 1; });
      var n = ports.length || 1;
      snap = {
        totalPorts: ports.length,
        tpfs: Math.round(ports.reduce(function (a, x) { return a + x.tpfs; }, 0) / n * 10) / 10,
        tpfsGrade: null,
        criticalPorts: byLv.CONGESTED,
        globalRisk: NETWORK.globalRisk,
        avgDelayHours: Math.round(ports.reduce(function (a, x) { return a + x.delayH; }, 0) / n * 10) / 10,
        distribution: ['LOW', 'STABLE', 'BUSY', 'CONGESTED'].map(function (lv) {
          return { level: lv, ratio: Math.round(byLv[lv] / n * 1000) / 10, count: byLv[lv], delta: 0 };
        }),
        periodStart: NETWORK.periodStart,
        periodEnd: NETWORK.periodEnd,
        reportDate: NETWORK.reportDate
      };
    }
    snap.tpfsGrade = levelOf(snap.tpfs);

    /* 권역별 집계 */
    var regional = Object.keys(REGIONS).map(function (rg) {
      var list = ports.filter(function (x) { return x.rg === rg; });
      var busyCon = list.filter(function (x) { return x.tpfs >= 50; }).length;
      var avgD = list.reduce(function (s, x) { return s + x.delayH; }, 0) / (list.length || 1);
      var r2 = mulberry32(seed * 31 + rg.length * 7);
      return {
        rg: rg, ko: REGIONS[rg].ko, en: REGIONS[rg].en,
        portCount: list.length,
        busyConRatio: Math.round((busyCon / (list.length || 1)) * 1000) / 10,
        avgDelayH: Math.round(avgD * 10) / 10,
        trend: r2() > 0.55 ? 'up' : (r2() > 0.45 ? 'flat' : 'down')
      };
    }).sort(function (a, b) { return b.busyConRatio - a.busyConRatio; });

    var byTpfs = ports.slice().sort(function (a, b) { return b.tpfs - a.tpfs; });

    /* 악화/개선 (tick 시드 기반 파생) */
    var movers = ports.map(function (x, idx) {
      var r3 = mulberry32(idx * 97 + 5);
      var dir = r3();
      var mag = 2 + r3() * 14;
      return { p: x, chg: Math.round((dir > 0.5 ? mag : -mag) * 10) / 10 };
    });
    var worsening = movers.filter(function (m) { return m.chg > 0; })
      .sort(function (a, b) { return b.chg - a.chg; }).slice(0, 10)
      .map(function (m, i) {
        return {
          rank: i + 1, ko: m.p.ko, en: m.p.en, cc: m.p.cc,
          pciChange: m.chg,
          delayIncH: Math.round(m.chg * 1.6 * 10) / 10,
          curDelayH: m.p.delayH, level: m.p.level
        };
      });
    var improving = movers.filter(function (m) { return m.chg < 0; })
      .sort(function (a, b) { return a.chg - b.chg; }).slice(0, 10)
      .map(function (m, i) {
        return {
          rank: i + 1, ko: m.p.ko, en: m.p.en, cc: m.p.cc,
          pciChange: m.chg,
          delayDecH: Math.round(-m.chg * 1.4 * 10) / 10,
          level: m.p.level
        };
      });

    /* 대기시간 최장 */
    var waitingTop = ports.slice().sort(function (a, b) { return b.waitH - a.waitH; })
      .slice(0, 10).map(function (x, i) {
        return {
          rank: i + 1, ko: x.ko, en: x.en, cc: x.cc, level: x.level,
          waitH: x.waitH, waiting: x.waiting, berthed: x.berthed,
          waitDays: Math.round((x.waitH / 24) * 10) / 10
        };
      });

    /* 병목 (UNCTAD Tw/Ts) */
    var bottleneck = ports.slice().sort(function (a, b) { return b.twts - a.twts; })
      .slice(0, 8).map(function (x) {
        return { ko: x.ko, en: x.en, level: x.level, waitH: x.waitH, serviceH: x.serviceH, twts: x.twts };
      });

    /* 하역 지연 (3일 vs 1개월 추세) */
    var discharge = ports.slice().sort(function (a, b) {
      return (b.serviceH - a.serviceH);
    }).slice(0, 10).map(function (x, i) {
      var r4 = mulberry32(seed * 13 + i * 41);
      var base = x.serviceH;
      var m = []; var k;
      for (k = 0; k < 8; k++) m.push(Math.round((base * (0.82 + r4() * 0.18)) * 10) / 10);
      var d3 = [];
      for (k = 0; k < 3; k++) d3.push(Math.round((base * (0.95 + r4() * 0.25)) * 10) / 10);
      var incr = Math.round((d3[2] - m[0]) * 10) / 10;
      return {
        rank: i + 1, ko: x.ko, en: x.en, level: x.level,
        levelChange: (r4() > 0.5 ? 'STABLE→BUSY' : 'BUSY→CONGESTED'),
        trend1m: m, trend3d: d3,
        incrH: Math.abs(incr)
      };
    });

    return {
      snapshot: snap,
      ports: ports,
      regional: regional,
      topCongested: byTpfs.slice(0, 10),
      worsening: worsening,
      improving: improving,
      waitingTop: waitingTop,
      bottleneck: bottleneck,
      discharge: discharge,
      focusPorts: rawPorts.map(function (x) { return { ko: x.ko, en: x.en, cc: x.cc }; })
    };
  }

  /* ---------- Supabase 실데이터 연동 ---------- */
  var MODE = 'sim';          /* 'sim' | 'supabase' */
  var liveRaw = null;        /* pi_ports → raw 포맷 */
  var liveNet = null;        /* pi_snapshot */
  var lastError = null;

  function sbFetch(path) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var to = ctrl ? setTimeout(function () { ctrl.abort(); }, SB_TIMEOUT_MS) : null;
    return fetch(SUPABASE_URL + path, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (to) clearTimeout(to);
      if (!r.ok) throw new Error('Supabase HTTP ' + r.status);
      return r.json();
    });
  }

  function mapRow(r) {
    return {
      en: r.name_en, ko: r.name_ko, cc: r.country_cd, rg: r.region_cd,
      lat: +r.lat, lng: +r.lng,
      t: +r.tpfs, d: +r.delay_h,
      w: r.waiting_cnt | 0, b: r.berthed_cnt | 0
    };
  }

  function fetchLive() {
    return Promise.all([
      sbFetch('/rest/v1/pi_ports?select=*'),
      sbFetch('/rest/v1/pi_snapshot?select=*&id=eq.1')
    ]).then(function (res) {
      var rows = res[0] || [];
      if (!rows.length) throw new Error('pi_ports 테이블이 비어 있습니다 (setup_supabase.sql 실행 필요)');
      liveRaw = rows.map(mapRow);
      var s = (res[1] && res[1][0]) || {};
      liveNet = {
        totalPorts: s.total_ports != null ? +s.total_ports : NETWORK.totalPorts,
        tpfs: s.tpfs != null ? +s.tpfs : NETWORK.tpfs,
        criticalPorts: s.critical_ports != null ? +s.critical_ports : NETWORK.criticalPorts,
        globalRisk: s.global_risk || NETWORK.globalRisk,
        avgDelayHours: s.avg_delay_h != null ? +s.avg_delay_h : NETWORK.avgDelayHours,
        distribution: (typeof s.distribution === 'string' ? JSON.parse(s.distribution) : s.distribution) || NETWORK.distribution,
        periodStart: s.period_start || NETWORK.periodStart,
        periodEnd: s.period_end || NETWORK.periodEnd,
        reportDate: NETWORK.reportDate,
        updatedAt: s.updated_at || null
      };
      MODE = 'supabase';
      lastError = null;
      return true;
    });
  }

  /* ---------- 공개 API ---------- */
  window.TWDATA = {
    LEVELS: LEVELS,
    REGIONS: REGIONS,
    levelOf: levelOf,
    /* 초기화: Supabase 시도 → 실패 시 시뮬레이션 폴백 (항상 resolve) */
    init: function () {
      if (typeof fetch === 'undefined') { MODE = 'sim'; return Promise.resolve(false); }
      return fetchLive().catch(function (e) {
        lastError = e; MODE = 'sim';
        return false;
      });
    },
    /* 폴링 재조회 (supabase 모드에서만 의미 있음) */
    refreshLive: function () { return fetchLive(); },
    getState: function (tick) {
      if (MODE === 'supabase' && liveRaw) {
        return buildState(liveRaw, liveNet, 7, false);   /* 실데이터: 변동 없이 그대로 */
      }
      return buildState(PORTS, null, 7, false);          /* 오프라인 캐시(정적) */
    },
    getMode: function () { return MODE; },
    getLastError: function () { return lastError; },
    getUpdatedAt: function () { return liveNet ? liveNet.updatedAt : null; },
    focusCount: PORTS.length,
    network: NETWORK
  };
})();
