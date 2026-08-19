/* =========================================================
   TWL 화물 추적 — 선사 직접 운송추적 (KLNET 대체)
   · MBL 입력 → 선사 자동 감지 → live(ONE·COSCO)는 Edge Function `carrier-track` 실조회,
     그 외 선사·AWB 는 공식 추적 페이지 딥링크 카드
   · 유니패스 통관조회는 사용하지 않는다(2026-08-11 사용자 결정 — Edge Function track 은 보존만)
   설계 근거: docs/03-architecture/화물추적_선사직접조회_설계.md (KLNET 레거시 분석)
   ========================================================= */
(function () {
  'use strict';

  var CARRIER_API = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/carrier-track';
  /* carrier-track 이 실조회를 지원하는 선사 (그 외는 딥링크 폴백)
     — 2026-08-11 태웅 실 MBL 검증 완료: ONE·COSCO·SM상선·Evergreen·SITC
     기본값은 확정 5사만 두고, 페이지 로드 시 서버 ?api=list 의 live 목록을 merge 한다.
     DCSA 3사(머스크·CMA·하파그)는 Supabase Secrets 에 키가 등록되는 순간 서버 목록에
     올라오므로 화면 재배포 없이 실조회로 전환된다(2026-08-12). */
  var LIVE_SCACS = { ONEY: 1, COSU: 1, SMLM: 1, EGLV: 1, SITC: 1 };
  fetch(CARRIER_API + '?api=list').then(function (r) { return r.json(); }).then(function (d) {
    (d.live || []).forEach(function (c) { if (c && c.scac) LIVE_SCACS[c.scac] = 1; });
  }).catch(function () { /* 목록 실패 시 기본 5사로 동작 */ });

  var AIRLINES = {
    '180': ['대한항공 Cargo', 'https://cargo.koreanair.com/'],
    '988': ['아시아나 Cargo', 'https://www.asianacargo.com/'],
    '618': ['싱가포르항공 Cargo', 'https://www.siacargo.com/'],
    '160': ['캐세이 Cargo', 'https://www.cathaycargo.com/'],
    '176': ['에미레이트 SkyCargo', 'https://www.skycargo.com/'],
    '157': ['카타르 Cargo', 'https://www.qrcargo.com/'],
    '172': ['카고룩스', 'https://www.cargolux.com/'],
    '999': ['에어차이나 Cargo', 'https://www.airchinacargo.com/'],
    '023': ['FedEx', 'https://www.fedex.com/ko-kr/tracking.html'],
    '406': ['UPS Air Cargo', 'https://www.ups.com/track']
  };
  /* 해상 MBL 프리픽스(SCAC) → 선사 트래킹 딥링크 */
  var OCEAN = {
    MAEU: ['Maersk', 'https://www.maersk.com/tracking/'],
    MSCU: ['MSC', 'https://www.msc.com/en/track-a-shipment'],
    HLCU: ['Hapag-Lloyd', 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno='],
    CMDU: ['CMA CGM', 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=BL&Reference='],
    ONEY: ['ONE', 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking?trakNoParam='],
    EGLV: ['Evergreen', 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do'],
    COSU: ['COSCO', 'https://elines.coscoshipping.com/ebusiness/cargoTracking'],
    OOLU: ['OOCL', 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/'],
    HDMU: ['HMM', 'https://www.hmm21.com/e-service/general/trackNTrace/TrackNTrace.do'],
    YMLU: ['Yang Ming', 'https://www.yangming.com/e-service/Track_Trace/track_trace_cargo_tracking.aspx'],
    WHLC: ['Wan Hai', 'https://www.wanhai.com/views/cargoTrack/CargoTrack.xhtml'],
    SMLM: ['SM상선', 'https://esvc.smlines.com/smline/CUP_HOM_3301.do'],
    SITC: ['SITC', 'https://ebusiness.sitcline.com/#/topMenu/cargoTrack?blNo='],
    ZIMU: ['ZIM', 'https://www.zim.com/tools/track-a-shipment'],
    KMTC: ['고려해운(KMTC)', 'https://www.ekmtc.com/index.html#/cargo-tracking']
  };
  function oceanInfo(no) {
    /* 프리픽스 4글자 + 영숫자 6자 이상 — 숫자만 강제하면 ONE 처럼 부킹오피스 문자가
       섞이는 BL(예: ONEYRICG34548800)을 놓친다(2026-08-11 실측). 오탐은 OCEAN 맵 조회가 걸러낸다. */
    var s = String(no).replace(/[^A-Za-z0-9]/g, '');
    var m = /^([A-Za-z]{4})[A-Za-z0-9]{6,}$/.exec(s);
    if (!m) return null;
    var scac = m[1].toUpperCase();
    /* SITC 는 BL 이 SIT+선적지코드 형태(SITPTTA012839G)라 4글자 프리픽스로 안 잡힌다 — 3글자로 판별 */
    if (!OCEAN[scac] && /^SIT/i.test(s)) scac = 'SITC';
    var c = OCEAN[scac];
    return { scac: scac, name: c ? c[0] : null, url: c ? (c[1].indexOf('=') > 0 || /\/$/.test(c[1]) ? c[1] + encodeURIComponent(no) : c[1]) : null };
  }

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function awbInfo(no) {
    var m = String(no).replace(/[^0-9]/g, '');
    if (m.length === 11) {
      var a = AIRLINES[m.slice(0, 3)];
      if (a) return { prefix: m.slice(0, 3), name: a[0], url: a[1] };
      return { prefix: m.slice(0, 3), name: null, url: null };
    }
    return null;
  }

  /* ============================================================
     선사 운송 추적 렌더러 (carrier-track)
     레거시 KlnetTrackList / LogisView 그리드 구조를 계승한다:
       ① 요약 헤더(BL·선사·현재상태)  ② 경로 시각화(항구 노드+진행바+선박)
       ③ 컨테이너별 게이트 이벤트 표(FMS_API_CNTR 컬럼 상당)  ④ 전체 이력(접기)
     ============================================================ */

  /* 선사별 이벤트 문구 → 정규 게이트 슬롯 9종.
     문구는 선사마다 다르고 선명/항차가 끼어들기도 해서(SM: "Loaded on 'X 2608S' at ...")
     부분 일치로 판정한다. 순서는 캐논 순서이며 표 컬럼 순서와 같다.
     어휘 근거: 2026-08-11 태웅 실 MBL 로 5개 선사 이벤트 전수 수집 */
  var SLOTS = [
    { k: 'eOut', label: '공컨 반출', grp: 'dep', re: /empty\s*(container)?\s*(release|pick)/i },
    { k: 'fIn', label: '적컨 반입', grp: 'dep', re: /gate\s*in to outbound|received \(fcl\)|outbound in cy/i },
    { k: 'load', label: '선적', grp: 'dep', re: /loaded (on|onto|\(fcl\))/i },
    { k: 'atd', label: '출항', grp: 'dep', re: /departure/i },
    { k: 'ts', label: '환적', grp: 'arr', re: /transship|transshipment|feeder/i },
    { k: 'ata', label: '입항', grp: 'arr', re: /arrival|berthing/i },
    { k: 'unld', label: '양하', grp: 'arr', re: /unloaded|discharged \(fcl\)|inbound in cy/i },
    { k: 'fOut', label: '적컨 반출', grp: 'arr', re: /gate\s*out from inbound|pick-up by merchant|transfer to designated/i },
    { k: 'eIn', label: '공컨 반납', grp: 'arr', re: /empty (container )?return/i }
  ];

  function fmtIso(v) {
    /* 항만 현지시각 문자열 — new Date() 로 브라우저 TZ 변환하지 않고 문자열 그대로 자른다 */
    var s = String(v || '');
    return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s;
  }
  function fmtShort(v) { var s = fmtIso(v); return s ? s.slice(2) : ''; }   /* 26-06-25 17:57 */
  /* 이벤트 문구 정리 — SM 은 statusNm 안에 <br> 태그와 선명 따옴표가 들어온다(실측) */
  function evName(s) {
    return String(s == null ? '' : s).replace(/<br\s*\/?>/gi, ' / ').replace(/\s+/g, ' ').trim();
  }

  /* 컨테이너 이벤트 배열 → 슬롯별 대표 이벤트(가장 이른 실적) */
  function toSlots(events) {
    var out = {};
    (events || []).forEach(function (e) {
      var nm = evName(e.name);
      for (var i = 0; i < SLOTS.length; i++) {
        if (SLOTS[i].re.test(nm)) {
          var k = SLOTS[i].k;
          if (!out[k] || (!out[k].actual && e.actual)) out[k] = e;
          break;
        }
      }
    });
    return out;
  }

  /* 현재 진행 상태 — 가장 뒤쪽 슬롯의 실적 이벤트 기준 */
  function progressOf(containers) {
    var maxIdx = -1;
    (containers || []).forEach(function (c) {
      var s = toSlots(c.events);
      for (var i = SLOTS.length - 1; i >= 0; i--) {
        if (s[SLOTS[i].k] && s[SLOTS[i].k].actual) { if (i > maxIdx) maxIdx = i; break; }
      }
    });
    return maxIdx;
  }
  function statusOf(idx) {
    if (idx < 0) return { t: '조회됨', c: 'is-wait' };
    var k = SLOTS[idx].k;
    if (k === 'eIn') return { t: '반납 완료', c: 'is-done' };
    if (k === 'fOut') return { t: '반출 완료', c: 'is-done' };
    if (k === 'unld') return { t: '양하 완료', c: 'is-move' };
    if (k === 'ata') return { t: '입항', c: 'is-move' };
    if (k === 'ts') return { t: '환적 중', c: 'is-move' };
    if (k === 'atd') return { t: '운송 중', c: 'is-move' };
    if (k === 'load') return { t: '선적 완료', c: 'is-wait' };
    return { t: '선적 대기', c: 'is-wait' };
  }

  /* ---- 인라인 SVG 아이콘 (이모지 미사용 — 렌더 일관성·크기 제어) ----
     currentColor 를 쓰므로 부모의 color 로 테마 대응된다. */
  var SVG = {
    ship: '<svg viewBox="0 0 32 32" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 22l1.6-6.2a2 2 0 011.9-1.5H24.5a2 2 0 011.9 1.5L28 22"/>' +
      '<path d="M10 14.3V9.5a1 1 0 011-1h5.5a1 1 0 011 1v4.8"/>' +
      '<path d="M16 4.5v4"/>' +
      '<path d="M2.5 22c2.2 0 2.2 2.4 4.5 2.4S9.2 22 11.5 22s2.2 2.4 4.5 2.4S18.2 22 20.5 22s2.2 2.4 4.5 2.4S27.2 22 29.5 22"/></svg>',
    anchor: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="5" r="2.2"/><path d="M12 7.2V21"/><path d="M8.5 11H15.5"/>' +
      '<path d="M20 16.5A8 8 0 0112 21a8 8 0 01-8-4.5"/></svg>',
    box: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5L12 12l9-4.5"/><path d="M12 12v9"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 12h13"/><path d="M13 7l5 5-5 5"/><path d="M20 4v16"/></svg>',
    into: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 12H7"/><path d="M11 7l-5 5 5 5"/><path d="M4 4v16"/></svg>',
    bell: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M18 8.5a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5"/><path d="M13.7 20a2 2 0 01-3.4 0"/></svg>',
    bellOff: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M8.7 3.3A6 6 0 0118 8.5c0 3 .6 4.9 1.3 6"/><path d="M6 8.5c0 6-2.5 7.5-2.5 7.5h12"/><path d="M13.7 20a2 2 0 01-3.4 0"/><path d="M2 2l20 20"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 6L9 17l-5-5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v13"/></svg>'
  };

  /* ============================================================
     Voyage Canvas — 항로 SVG 시각화 (2026-08-19 고도화, 설계서 축 A)
     KLNET 의 도트 진행바를 대체·초과: 실적 구간은 실선, 예정 구간은 점선,
     선박 마커는 "마지막 실적 출발시각 ~ 다음 항 예정시각" 시간 보간으로 배치.
     외부 이미지 0 — 전부 인라인 SVG, 색은 CSS 변수라 테마 자동 대응.
     640px 이하는 세로 타임라인으로 전환(같은 데이터, 다른 DOM — CSS 가 가른다).
     ============================================================ */
  function vcPts(res, doneRatio) {
    var legs = (res.voyages || []).slice();
    var pts = [];
    if (legs.length) {
      pts.push({ nm: legs[0].pol && legs[0].pol.name, dt: legs[0].pol && legs[0].pol.date, act: !!(legs[0].pol && legs[0].pol.actual) });
      legs.forEach(function (v) { pts.push({ nm: v.pod && v.pod.name, dt: v.pod && v.pod.date, act: !!(v.pod && v.pod.actual) }); });
    } else {
      var s = res.summary || {};
      pts.push({ nm: s.por, dt: null, act: doneRatio > 0 });
      pts.push({ nm: s.pod, dt: null, act: doneRatio >= 1 });
    }
    pts = pts.filter(function (p) { return p.nm; });
    /* 연속 동일 항구는 하나로 — 환적이 A→B, B→C 로 오면 B 가 두 번 잡힌다(실측) */
    pts = pts.filter(function (p, i, a) {
      return i === 0 || String(p.nm).toUpperCase() !== String(a[i - 1].nm).toUpperCase();
    });
    return pts;
  }
  function vcCode(nm) {
    nm = String(nm || '');
    return (/^[A-Z]{5}$/.test(nm) ? nm : nm.split(/[,(]/)[0].trim().slice(0, 14)).toUpperCase();
  }
  /* 2차 베지어 위의 점 — 선박 마커 좌표 */
  function vcQ(x0, y0, cx, cy, x1, y1, t) {
    var u = 1 - t;
    return { x: u * u * x0 + 2 * u * t * cx + t * t * x1, y: u * u * y0 + 2 * u * t * cy + t * t * y1 };
  }
  function vcDate(v) { var t = Date.parse(String(v || '').replace(' ', 'T')); return isFinite(t) ? t : NaN; }

  /* 시각대 라벨 — 선사가 본사 시간대로 시각을 주는 경우(실측: ZIM 전량 +03:00)
     변환하지 않고 "무슨 시간대인지"를 보이게 한다(2026-08-19 사용자 결정).
     이벤트 전체가 단일 오프셋일 때만 라벨을 만든다 — 혼재 시 오해를 만들 수 있다. */
  function tzTag(res) {
    var offs = {};
    (res.containers || []).forEach(function (c) {
      (c.events || []).forEach(function (e) {
        var m = /([+-])(\d{2}):?(\d{2})\s*$/.exec(String(e.timeLocal || ''));
        if (m) offs[m[1] + parseInt(m[2], 10) + (m[3] !== '00' ? ':' + m[3] : '')] = 1;
      });
    });
    var ks = Object.keys(offs);
    return ks.length === 1 ? 'UTC' + ks[0] : '';
  }

  function voyageCanvas(res, idx) {
    var pts = vcPts(res, idx / (SLOTS.length - 1));
    if (pts.length < 2) return '';
    var s = res.summary || {};
    var n = pts.length;
    var W = 1000, base = 100, mX = 86;
    var xs = [];
    for (var i = 0; i < n; i++) xs.push(mX + i * (W - 2 * mX) / (n - 1));
    var rise = n <= 3 ? 46 : 34;

    var lastAct = -1;
    pts.forEach(function (p, i) { if (p.act) lastAct = i; });
    var sailing = lastAct >= 0 && lastAct < n - 1;

    /* 현재 구간 진행률 — ATD~ETA 시간 보간. 시각이 없거나 어긋나면 중간쯤. */
    var t = 0.45;
    if (sailing) {
      var d0 = vcDate(pts[lastAct].dt), d1 = vcDate(pts[lastAct + 1].dt);
      if (isFinite(d0) && isFinite(d1) && d1 > d0) t = Math.max(0.07, Math.min(0.93, (Date.now() - d0) / (d1 - d0)));
    }

    var svg = '<svg viewBox="0 0 ' + W + ' 196" role="img" aria-label="항로 진행 — ' +
      esc(pts.map(function (p) { return vcCode(p.nm); }).join(' → ')) + '" preserveAspectRatio="xMidYMid meet">';

    /* 구간(legs) */
    for (i = 0; i < n - 1; i++) {
      var x0 = xs[i], x1 = xs[i + 1], cx = (x0 + x1) / 2, cy = base - rise;
      var d = 'M' + x0 + ' ' + base + ' Q' + cx + ' ' + cy + ' ' + x1 + ' ' + base;
      if (i < lastAct) {
        svg += '<path class="vc-l-done" d="' + d + '"/>';
      } else if (i === lastAct && sailing) {
        svg += '<path class="vc-l-todo" d="' + d + '"/>' +
          '<path class="vc-l-flow" d="' + d + '" pathLength="100"/>' +
          '<path class="vc-l-done" d="' + d + '" pathLength="100" stroke-dasharray="' + (t * 100).toFixed(1) + ' 100"/>';
      } else {
        svg += '<path class="vc-l-todo" d="' + d + '"/>';
      }
    }

    /* 선박 마커 — 현재 구간 베지어 위 + 선명·항차 라벨 (텍스트 halo 로 배경과 분리) */
    if (sailing) {
      var x0s = xs[lastAct], x1s = xs[lastAct + 1];
      var pos = vcQ(x0s, base, (x0s + x1s) / 2, base - rise, x1s, base, t);
      svg += '<g class="vc-ship-g" transform="translate(' + (pos.x - 13) + ' ' + (pos.y - 30) + ')">' +
        '<path d="M3 18l1.3-5a1.6 1.6 0 011.6-1.2h14.2a1.6 1.6 0 011.6 1.2l1.3 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M8 11.7V7.9a.9.9 0 01.9-.9h4.6a.9.9 0 01.9.9v3.8M13 4v3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
        '<path d="M1.8 18c1.9 0 1.9 2 3.8 2s1.9-2 3.8-2 1.9 2 3.8 2 1.9-2 3.8-2 1.9 2 3.8 2 1.9-2 3.8-2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></g>';
      if (s.vessel) {
        svg += '<text class="vc-ship-lb" x="' + pos.x + '" y="' + (pos.y - 38) + '" text-anchor="middle">' +
          esc(String(s.vessel).slice(0, 24) + (s.voyage ? ' ' + s.voyage : '')) + '</text>';
      }
    }

    /* 항구 노드 + 라벨 */
    for (i = 0; i < n; i++) {
      var p = pts[i], x = xs[i];
      if (p.act) svg += '<circle class="vc-glow" cx="' + x + '" cy="' + base + '" r="11"/>';
      svg += '<circle class="vc-node' + (p.act ? ' done' : '') + '" cx="' + x + '" cy="' + base + '" r="6.5"/>';
      if (i > 0 && i < n - 1) svg += '<text class="vc-ts" x="' + x + '" y="' + (base - 16) + '" text-anchor="middle">T/S</text>';
      var code = vcCode(p.nm), nm = String(p.nm || '');
      svg += '<text class="vc-code" x="' + x + '" y="' + (base + 32) + '" text-anchor="middle">' + esc(code) + '</text>';
      if (nm && nm.toUpperCase() !== code) {
        svg += '<text class="vc-name" x="' + x + '" y="' + (base + 48) + '" text-anchor="middle">' + esc(nm.slice(0, 22)) + '</text>';
      }
      if (p.dt) {
        /* KLNET 의 E/A 마커 대응 — A(실측) 초록 · E(예정) 회색 칩 */
        var dtx = fmtShort(p.dt);
        var chipW = 15, tw = dtx.length * 6.6, bx = x - (chipW + 4 + tw) / 2;
        svg += '<g class="vc-ae ' + (p.act ? 'a' : 'e') + '">' +
          '<rect x="' + bx + '" y="' + (base + 56) + '" width="' + chipW + '" height="14" rx="3.5"/>' +
          '<text x="' + (bx + chipW / 2) + '" y="' + (base + 67) + '" text-anchor="middle">' + (p.act ? 'A' : 'E') + '</text></g>' +
          '<text class="vc-date' + (p.act ? ' act' : '') + '" x="' + (bx + chipW + 4) + '" y="' + (base + 67) + '">' + esc(dtx) + '</text>';
      }
    }
    svg += '</svg>';

    /* 모바일 세로 타임라인 — 같은 데이터의 수직 표현 */
    var v = '<ol class="vc-vert">';
    for (i = 0; i < n; i++) {
      var q = pts[i];
      v += '<li class="' + (q.act ? 'done' : 'todo') + (i === n - 1 ? ' last' : '') + '">' +
        '<b>' + esc(vcCode(q.nm)) + '</b>' +
        (q.dt ? '<small class="' + (q.act ? 'act' : '') + '">' + (q.act ? 'A' : 'E') + ' ' + esc(fmtShort(q.dt)) + '</small>' : '') +
        '</li>';
      if (i === lastAct && sailing) {
        v += '<li class="ship">' + SVG.ship + ' <span>' + esc(s.vessel || '운송 중') + (s.voyage ? ' ' + esc(s.voyage) : '') + '</span></li>';
      }
    }
    v += '</ol>';

    return '<div class="vc-wrap">' + svg + '</div>' + v;
  }

  /* 티켓 요약 칼럼 — 항해도와 한 그리드(오와열 정렬, 2026-08-19 개편) */
  /* 섹션 레일 — 티켓 내 영역 구분 명시(2026-08-19 지적) */
  function tkSecH(ko, en) {
    return '<div class="tk-sh"><i class="tk-tick"></i><b>' + ko + '</b>' +
      (en ? '<span>' + en + '</span>' : '') + '<i class="tk-ln"></i></div>';
  }

  function tkSummaryHtml(res, st, pts) {
    var n = (pts || []).length;
    var s = res.summary || {};
    if (n < 2) return '<div class="tk-sum"></div>';
    var org = pts[0], dest = pts[n - 1], next = null;
    for (var i = 0; i < n; i++) { if (!pts[i].act) { next = pts[i]; break; } }
    var etaTxt = dest.dt ? fmtShort(dest.dt) : '';
    var dd = '';
    if (dest.dt && !dest.act) {
      var ms = vcDate(dest.dt) - Date.now();
      if (isFinite(ms)) { var d = Math.ceil(ms / 864e5); dd = d >= 0 ? 'D-' + d : 'D+' + (-d); }
    }
    return '<div class="tk-sum">' +
      '<div class="tk-route">' + esc(vcCode(org.nm)) + ' <i>→</i> ' + esc(vcCode(dest.nm)) + '</div>' +
      '<div class="tk-eta-k">' + (dest.act ? '도착' : 'ETA') + (dd ? ' <span class="tk-dd">' + dd + '</span>' : '') + '</div>' +
      '<div class="tk-eta">' + esc(etaTxt || '미정') + '</div>' +
      (next ? '<div class="tk-next">다음 이벤트<br><b>' + esc(vcCode(next.nm)) + '</b>' +
        (next.dt ? ' ' + esc(fmtShort(next.dt)) : '') + '</div>' : '') +
      '</div>';
  }
  function renderCarrier(res, no) {
    var out = el('carrierOut');
    if (!res || res.error) {
      var sh0 = el('statusHero'); if (sh0) sh0.innerHTML = '';
      var oc0 = oceanInfo(no);
      out.innerHTML = '<div class="card reveal in" style="margin-bottom:14px;">' +
        '<h3 style="margin-top:0;">선사 운송 추적</h3>' +
        '<p class="sc-sub">' + esc(res && res.error || '조회 실패') + '</p>' +
        (oc0 && oc0.url ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + oc0.url + '">' + esc(oc0.name) + ' 트래킹 ↗</a>' : '') +
        '</div>';
      return;
    }
    var s = res.summary || {};
    var cs = res.containers || [];
    var idx = progressOf(cs);
    var st = statusOf(idx);
    var sh1 = el('statusHero'); if (sh1) sh1.innerHTML = '';

    var h = '<div class="card trk-card reveal in" style="margin-bottom:14px;">';

    /* ① 헤더 */
    h += '<div class="trk-head">' +
      '<span class="trk-bl">' + esc((res.query || {}).no || no) + '</span>' +
      '<span class="trk-carrier">' + esc(res.carrierName || res.carrier || '') + '</span>' +
      '<span class="trk-badge ' + st.c + '">' + esc(st.t) + '</span>' +
      '<span class="trk-spacer"></span>' +
      (s.vessel ? '<span class="trk-carrier">' + esc(s.vessel) + (s.voyage ? ' ' + esc(s.voyage) : '') + '</span>' : '') +
      '<button class="btn btn-ghost trk-watch-btn" type="button" id="watchBtn" data-mbl="' + esc((res.query || {}).no || no) +
      '" data-carrier="' + esc(res.carrier || '') + '">' + SVG.bell + ' 추적 등록</button>' +
      '</div>';

    /* ② 경로 — Voyage Canvas(SVG) + ③ 국내 터미널 패널(비동기 채움) */
    h += tkSecH('운송 요약', 'SUMMARY');
    h += '<div class="tk-grid">' +
      tkSummaryHtml(res, st, vcPts(res, idx / (SLOTS.length - 1))) +
      '<div class="tk-voy">' + voyageCanvas(res, idx) + '</div></div>';
    h += '<div id="tmlPanel"></div>';

    /* ③ 게이트 스텝 그리드 — KLNET 9단계 도트바 상위호환.
       등폭 9열 그리드라 컨테이너가 몇 건이든 오와열이 자동 정렬된다(표·가로스크롤 폐기) */
    if (cs.length) {
      h += '<div class="trk-sec">' + tkSecH('게이트 이벤트', 'GATE EVENTS · 컨테이너 ' + cs.length + '건') +
        '<div class="gs-scroll"><div class="gs-wrap">' +
        '<div class="gs-r gs-heads"><span class="gs-c0"></span>' +
        '<span class="gs-gh dep">' + SVG.out + ' 출발지 DEPARTURE</span>' +
        '<span class="gs-gh arr">' + SVG.into + ' 도착지 DESTINATION</span></div>' +
        '<div class="gs-r gs-labels"><span class="gs-c0"></span>' +
        SLOTS.map(function (x) { return '<span class="gs-lb">' + x.label + '</span>'; }).join('') + '</div>' +
        cs.map(function (c) {
          var sl = toSlots(c.events);
          return '<div class="gs-r gs-line"><span class="gs-c0">' + SVG.box + ' <b>' + esc(c.cntrNo || '') + '</b><small>' + esc(c.szTp || '') + '</small></span>' +
            SLOTS.map(function (x) {
              var e = sl[x.k];
              var cls = e ? (e.actual ? 'act' : 'exp') : 'na';
              var t = e ? fmtShort(e.timeLocal || e.timeUtc) : '';
              /* 날짜·시각 2단 스택 — 한 줄이면 이웃 셀과 충돌(오와열 깨짐) */
              var dparts = String(t || '').split(' ');
              var dEl = t
                ? '<span class="gs-dt"><b>' + esc((dparts[0] || '').replace(/^\d\d-/, '')) + '</b>' +
                  (dparts[1] ? '<small>' + esc(dparts[1]) + '</small>' : '') + '</span>'
                : '<span class="gs-dt na">·</span>';
              return '<span class="gs-cell ' + cls + '" title="' + esc(x.label + (e && e.location ? ' · ' + e.location : '') + (e && !e.actual ? ' · 예정' : '')) + '">' +
                '<i class="gs-dot"></i>' + dEl + '</span>';
            }).join('') + '</div>';
        }).join('') +
        '</div></div>';

      /* 게이트 이벤트를 안 주는 선사(COSCO)는 컨테이너 최신 상태라도 보여준다 */
      var lats = cs.filter(function (c) { return c.latest && c.latest.name; });
      if (lats.length) {
        h += '<p class="sc-sub" style="margin:10px 0 0; font-size:12px;">최신 상태 — ' +
          lats.map(function (c) {
            return '<b>' + esc(c.cntrNo) + '</b> ' + esc(c.latest.name) +
              (c.latest.location ? ' · ' + esc(String(c.latest.location).split(',')[0]) : '') +
              (c.latest.timeLocal ? ' · ' + esc(fmtIso(c.latest.timeLocal)) : '');
          }).join('<br>') + '</p>';
      }

      /* ④ 전체 이력 (접기) */
      if (cs.some(function (c) { return (c.events || []).length; })) {
        h += tkSecH('컨테이너 이력', 'HISTORY');
      }
      cs.forEach(function (c) {
        var evs = c.events || [];
        if (!evs.length) return;
        h += '<details class="trk-more"><summary>' + esc(c.cntrNo || '') + ' 전체 이력 ' + evs.length + '건' +
          (c.eventsSynthesized ? ' (본선 구간 기준)' : '') + '</summary><ul class="trk-evlist">' +
          evs.map(function (e) {
            var t = fmtIso(e.timeLocal || e.timeUtc);
            return '<li class="' + (e.actual ? 'act' : '') + '"><b>' + esc(evName(e.name)) + '</b>' +
              '<small>' + esc(e.location || '') + (e.yard ? ' · ' + esc(e.yard) : '') +
              (t ? ' · ' + esc(t) : '') + (e.actual ? '' : ' · 예정') + '</small></li>';
          }).join('') + '</ul></details>';
      });
      h += '</div>';
    } else {
      h += '<div class="trk-sec"><p class="sc-sub">컨테이너 정보가 없습니다.</p></div>';
    }

    var tz = tzTag(res);
    h += '<div class="trk-head" style="border-bottom:0; border-top:1px solid var(--border);">' +
      '<span class="trk-asof">데이터 시점 ' + esc(fmtIso(res.fetchedAt)) + ' UTC · 출처 ' + esc(res.source || '') + ' · ' +
      (tz && tz !== 'UTC+9'
        ? '<b style="color:var(--lv-busy);">시각 표기 ' + esc(tz) + ' — 선사 제공 시간대(한국시각 아님)</b>'
        : '시각은 항만 현지 기준') + '</span></div>';
    h += '</div>';
    out.innerHTML = h;
    bindWatchBtn();
    terminalPanel(res);
  }

  /* ============================================================
     국내 터미널 일정 패널 (설계서 축 C) — 선명+항차를 선석 수집 데이터
     (bs_vessel_calls, 16터미널 × 35일 이력)와 매칭해 접안·출항·반입마감을 붙인다.
     같은 기항의 과거 수집분과 ETB/ETD 가 다르면 "터미널발 변경"으로 표시 —
     KLNET 스케줄변경알림의 원리를 조회 화면 안에서 즉석 재현하는 셈.
     매칭 실패는 조용히 생략한다(오탐 배지 금지 — 설계 원칙).
     ============================================================ */
  var SB_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var SB_KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv';
  var TML_PORT = {
    PNIT: '부산신항', PNC: '부산신항', HJNC: '부산신항', HPNT: '부산신항', BNCT: '부산신항', DGT: '부산신항', BCT: '부산신항',
    BPT: '부산북항', HBCT: '부산북항', E1CT: '인천', ICON: '인천', GWCT: '광양', KITL: '광양',
    PCTC: '평택당진', PNCT: '평택당진', DDCT: '대산'
  };
  function vnorm(x) { return String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, ''); }

  function terminalPanel(res) {
    var host = el('tmlPanel'); if (!host) return;
    var s = res.summary || {};
    if (!s.vessel) return;
    var vq = String(s.vessel).trim().replace(/\s+/g, ' ').toUpperCase();
    var url = SB_URL + '/rest/v1/bs_vessel_calls' +
      '?select=terminal_cd,berth,vessel_name,voyage,eta,etd,cct,route,collected_date' +
      '&vessel_name=ilike.' + encodeURIComponent('*' + vq + '*') +
      '&order=collected_date.desc&limit=120';
    fetch(url, { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (!Array.isArray(rows) || !rows.length) return;
        /* ── 매칭 규칙 ──
           선사 항차와 터미널 항차는 표기 체계가 다르다(실측: ZIM "12E" vs BCT "ZZIW001").
           그래서 항차 일치는 "보너스"일 뿐, 1차 기준은 ①같은 선명 ②기항 시각이
           BL 의 한국 출항시각 ±4일(모르면 현재 기준 -7일~+30일 창)이다. */
        var vv = vnorm(s.voyage);
        var legs = res.voyages || [];
        var polT = legs.length && legs[0].pol ? vcDate(legs[0].pol.date) : NaN;
        /* P5 교차검증용 — 선사 쪽 예정값(실적 확정 전만 비교 대상) */
        var lastLeg = legs.length ? legs[legs.length - 1] : null;
        var podT = lastLeg && lastLeg.pod ? vcDate(lastLeg.pod.date) : NaN;
        var cPol = legs.length ? legs[0].pol : null;
        var cPod = lastLeg ? lastLeg.pod : null;
        var byK = {};
        rows.forEach(function (r) {
          var k = r.terminal_cd + '|' + vnorm(r.voyage);
          (byK[k] = byK[k] || []).push(r);      /* collected_date 내림차순 유지 */
        });
        var cards = [];
        Object.keys(byK).forEach(function (k) {
          var arr = byK[k], cur = arr[0];
          var ref = vcDate(cur.etd || cur.eta);
          if (!isFinite(ref)) return;
          if (ref < Date.now() - 7 * 864e5 || ref > Date.now() + 30 * 864e5) return;  /* 무관한 기항 */
          var rv = vnorm(cur.voyage);
          var voyHit = !!(vv && rv && (rv.indexOf(vv) >= 0 || vv.indexOf(rv) >= 0));
          var timeHit = (isFinite(polT) && Math.abs(ref - polT) < 4 * 864e5) ||
                        (isFinite(podT) && Math.abs(ref - podT) < 4 * 864e5);
          /* BL 출항·도착 시각을 알면 그 창 밖 기항은 버린다(다른 항차 오탐 방지) */
          if ((isFinite(polT) || isFinite(podT)) && !voyHit && !timeHit) return;
          var chg = 0, hist = [];
          for (var i = 1; i < arr.length; i++) {
            var a = arr[i], b = arr[i - 1];
            if (String(a.eta || '') !== String(b.eta || '') || String(a.etd || '') !== String(b.etd || '')) {
              chg++;
              hist.push(b.collected_date + ' 접안 ' + (fmtShort(a.eta) || '-') + '→' + (fmtShort(b.eta) || '-') +
                ' · 출항 ' + (fmtShort(a.etd) || '-') + '→' + (fmtShort(b.etd) || '-'));
            }
          }
          cards.push({ cur: cur, chg: chg, hist: hist });
        });
        if (!cards.length) return;

        var h = '<div class="trk-sec tml-sec">' +
          tkSecH('국내 터미널', 'TERMINAL CROSS-CHECK · ' + esc(vq) + (s.voyage ? ' ' + esc(s.voyage) : '')) +
          '<div class="tml-row">';
        cards.forEach(function (c) {
          var r = c.cur;
          var cctT = vcDate(r.cct), left = '';
          var cls = '';
          if (isFinite(cctT)) {
            var ms = cctT - Date.now();
            if (ms > 0) {
              var hh = Math.floor(ms / 36e5);
              left = 'D-' + Math.floor(hh / 24) + ' ' + (hh % 24) + 'h';
              if (ms < 24 * 36e5) cls = ' warn';
            } else left = '마감';
          }
          /* P5 교차검증 — 이 기항이 수출(출항)·수입(접안) 어느 쪽인지는 시간 근접으로 판정.
             선사 값이 아직 예정(EST)인 경우에만 비교한다 — 실적 확정 후 불일치는 과거사다. */
          var refT2 = vcDate(r.etd || r.eta);
          var dPol = isFinite(polT) ? Math.abs(refT2 - polT) : Infinity;
          var dPod = isFinite(podT) ? Math.abs(refT2 - podT) : Infinity;
          var cmp = dPol <= dPod
            ? { cv: cPol, tv: vcDate(r.etd), lb: '출항', ts: fmtShort(r.etd) }
            : { cv: cPod, tv: vcDate(r.eta), lb: '접안', ts: fmtShort(r.eta) };
          var xbadge = '';
          if (cmp.cv && !cmp.cv.actual) {
            var cvT = vcDate(cmp.cv.date);
            if (isFinite(cvT) && isFinite(cmp.tv) && Math.abs(cvT - cmp.tv) > 12 * 36e5) {
              xbadge = '<i class="t-x" title="선사 ' + cmp.lb + ' ' + esc(fmtShort(cmp.cv.date)) +
                ' ↔ 터미널 ' + cmp.lb + ' ' + esc(cmp.ts) +
                ' — 12시간 이상 차이. 국내 구간은 터미널 값이 통상 더 최신입니다.">소스 불일치</i>';
            }
          }
          h += '<div class="tml-card' + cls + '">' +
            '<div class="t-hd"><b>' + esc(r.terminal_cd) + '</b><span>' + esc(TML_PORT[r.terminal_cd] || '') + '</span>' +
            (r.berth ? '<em>선석 ' + esc(r.berth) + '</em>' : '') + xbadge +
            (c.chg ? '<i class="t-chg" title="' + esc(c.hist.join('\n')) + '">변경 ' + c.chg + '회</i>' : '') +
            '</div>' +
            '<div class="t-bd">접안 <b>' + esc(fmtShort(r.eta) || '-') + '</b> · 출항 <b>' + esc(fmtShort(r.etd) || '-') + '</b></div>' +
            (r.cct ? '<div class="t-cct">반입마감 ' + esc(fmtShort(r.cct)) +
              (left ? ' <b class="left">' + left + '</b>' : '') + '</div>' : '') +
            '</div>';
        });
        h += '</div></div>';
        host.innerHTML = h;
      }).catch(function () { /* 매칭 실패는 조용히 */ });
  }

  /* ============================================================
     추적 등록·감시 그리드 (선석배정 그리드와 동일 사상: 툴바 필터 + 페이지네이션)
     등록해두면 스케줄러가 매일 08:20/20:20 조회해 ETD/ETA 변경 시 메일 발송.
     ============================================================ */
  var WATCH_API = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/bl-watch';
  var WATCH_PAGE = 20;                     /* 페이지당 행수 */
  var watchState = { items: [], page: 1, q: '', carrier: '', active: 'all', status: '', route: '', sort: 'reg', carriers: null };

  function mySession() {
    try { return JSON.parse(localStorage.getItem('twl-auth') || 'null') || {}; } catch (e) { return {}; }
  }
  function myEmail() { var s = mySession(); return s.email || s.login_id || s.login || ''; }
  /* 세션 토큰 — 서버(app_me)가 검증한다. 클라이언트가 신원을 위조할 수 없다. */
  function myToken() { return mySession().token || ''; }

  /* 지원 선사 목록(1회 로드) — 등록 가능 여부·실조회/딥링크 구분 안내에 사용 */
  function loadCarriers(cb) {
    if (watchState.carriers) { cb && cb(); return; }
    fetch(WATCH_API + '?action=carriers').then(function (r) { return r.json(); }).then(function (d) {
      watchState.carriers = d; cb && cb();
    }).catch(function () { watchState.carriers = { live: [], deeplink: [] }; cb && cb(); });
  }
  function carrierName(scac) {
    var c = watchState.carriers || {};
    var f = (c.live || []).concat(c.deeplink || []).filter(function (x) { return x.scac === scac; })[0];
    return f ? f.name : (scac || '');
  }
  function isLive(scac) { return ((watchState.carriers || {}).live || []).some(function (x) { return x.scac === scac; }); }

  /* 등록 목록에서 이 BL 을 찾는다(대소문자·특수문자 무시) */
  function findWatch(mbl) {
    var m = String(mbl || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return (watchState.items || []).filter(function (x) { return String(x.mbl_no).toUpperCase() === m; })[0];
  }

  /* 조회 결과 헤더의 "추적 등록" 버튼 —
     이미 등록된 BL 이면 버튼이 "감시 중" 상태로 나타나고, 눌러도 재등록이 아니라 목록으로 이동한다.
     (재조회해도 등록 여부가 버튼에 그대로 반영된다) */
  function bindWatchBtn() {
    var b = el('watchBtn');
    if (!b) return;
    var mbl = b.getAttribute('data-mbl'), carrier = b.getAttribute('data-carrier');
    var w = findWatch(mbl);
    if (w && w.active) { markBtnWatching(b); return; }
    b.addEventListener('click', function () {
      openRegDialog([{ mbl_no: mbl, carrier: carrier }], function () { markBtnWatching(b); });
    });
  }
  function markBtnWatching(b) {
    b.innerHTML = SVG.check + ' 감시 중';
    b.classList.add('is-on');
    b.title = '이미 추적 등록됨 — 아래 목록에서 관리';
    b.onclick = function () { var s = el('watch'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }
  /* 목록이 (조회 이후) 늦게 로드된 경우에도 버튼 상태를 맞춘다 */
  function syncWatchBtn() {
    var b = el('watchBtn');
    if (!b || b.classList.contains('is-on')) return;
    var w = findWatch(b.getAttribute('data-mbl'));
    if (w && w.active) markBtnWatching(b);
  }

  /* 등록 다이얼로그 (단건·다건 공용) — 기간 3/6개월 선택 + 알림 이메일 */
  function openRegDialog(rows, onDone) {
    var ov = document.createElement('div');
    ov.className = 'reg-ov';
    var many = rows.length > 1;
    ov.innerHTML = '<div class="reg-card">' +
      '<h3>추적 등록' + (many ? ' <small>' + rows.length + '건</small>' : ' <small>' + esc(rows[0].mbl_no) + '</small>') + '</h3>' +
      '<label class="reg-l">추적 기간</label>' +
      '<div class="reg-seg" id="regTerm"><button data-m="3" class="on">3개월</button><button data-m="6">6개월</button></div>' +
      '<p class="reg-hint">기간이 지나면 자동으로 추적이 해제됩니다.</p>' +
      '<label class="reg-l">알림 이메일 <span class="reg-opt">(비우면 등록만, 메일 없음)</span></label>' +
      '<input type="email" id="regMail" class="focus-search" placeholder="you@twsc.co.kr" value="' + esc(myEmail()) + '">' +
      '<div id="regMsg" class="reg-msg"></div>' +
      '<div class="reg-btns"><button class="btn btn-ghost" id="regCancel">취소</button>' +
      '<button class="btn btn-primary" id="regOk">등록</button></div></div>';
    document.body.appendChild(ov);
    var term = 3;
    ov.querySelectorAll('#regTerm button').forEach(function (x) {
      x.addEventListener('click', function () {
        term = Number(x.getAttribute('data-m'));
        ov.querySelectorAll('#regTerm button').forEach(function (y) { y.classList.remove('on'); });
        x.classList.add('on');
      });
    });
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    el2(ov, 'regCancel').addEventListener('click', close);
    el2(ov, 'regOk').addEventListener('click', function () {
      var mail = el2(ov, 'regMail').value.trim();
      var msg = el2(ov, 'regMsg');
      el2(ov, 'regOk').disabled = true; el2(ov, 'regOk').textContent = '등록 중…';
      var body = many
        ? { action: 'bulk', token: myToken(), term_months: term, notify_email: mail, rows: rows }
        : { action: 'add', token: myToken(), mbl_no: rows[0].mbl_no, carrier: rows[0].carrier, term_months: term, notify_email: mail };
      fetch(WATCH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d.error) { msg.innerHTML = '<span class="reg-err">' + esc(d.error) + '</span>'; el2(ov, 'regOk').disabled = false; el2(ov, 'regOk').textContent = '등록'; return; }
          if (many) {
            msg.innerHTML = '<span class="reg-ok">등록 ' + d.added + '건 · 실패 ' + d.failed + '건</span>' +
              (d.failed ? '<div class="reg-fail">' + (d.results || []).filter(function (x) { return !x.ok; })
                .map(function (x) { return esc(x.mbl_no) + ' — ' + esc(x.error); }).join('<br>') + '</div>' : '');
            setTimeout(function () { close(); loadWatchList(); onDone && onDone(); }, d.failed ? 2500 : 700);
          } else {
            close(); loadWatchList(); onDone && onDone();
          }
        }).catch(function () { msg.innerHTML = '<span class="reg-err">네트워크 오류 — 잠시 후 다시.</span>'; el2(ov, 'regOk').disabled = false; el2(ov, 'regOk').textContent = '등록'; });
    });
  }
  function el2(root, id) { return root.querySelector('#' + id); }

  /* 필터 적용된 결과 */
  function progOf(it) { var s = it.snapshot || {}; return s.status || it.last_status || ''; }
  function routeOf(it) { var s = it.snapshot || {}; return [s.por, s.pod].filter(Boolean).join(' → '); }

  function watchFiltered() {
    var rows = watchState.items.filter(function (it) {
      if (watchState.active === 'on' && !it.active) return false;
      if (watchState.active === 'off' && it.active) return false;
      if (watchState.carrier && it.carrier !== watchState.carrier) return false;
      if (watchState.status && progOf(it) !== watchState.status) return false;
      if (watchState.route) {
        if (routeOf(it).toUpperCase().indexOf(watchState.route.toUpperCase()) < 0) return false;
      }
      if (watchState.q) {
        var q = watchState.q.toUpperCase();
        if ((it.mbl_no || '').toUpperCase().indexOf(q) < 0 && (it.memo || '').toUpperCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    /* 정렬 — 등록순(기본)·ETD·ETA·남은기간 */
    var sort = watchState.sort;
    if (sort !== 'reg') {
      rows = rows.slice().sort(function (a, b) {
        if (sort === 'exp') return (daysLeft(a.expires_at) ?? 9e9) - (daysLeft(b.expires_at) ?? 9e9);
        var ka = ((a.snapshot || {})[sort] || ''), kb = ((b.snapshot || {})[sort] || '');
        if (!ka && !kb) return 0; if (!ka) return 1; if (!kb) return -1;
        return String(ka) < String(kb) ? -1 : 1;
      });
    }
    return rows;
  }

  function daysLeft(exp) {
    if (!exp) return null;
    return Math.ceil((new Date(exp).getTime() - Date.now()) / 86400000);
  }

  function watchRowHtml(it) {
    var s = it.snapshot || {};
    var ch = it.changes || [];
    var badge = it.active ? '<span class="trk-badge is-move">감시 중</span>' : '<span class="trk-badge is-done">종료</span>';
    var dl = daysLeft(it.expires_at);
    var expTxt = it.active && dl != null
      ? (dl <= 0 ? '<span style="color:var(--up);">만료</span>' : (dl <= 14 ? '<span style="color:var(--lv-busy);">' + dl + '일</span>' : dl + '일'))
      : '-';
    /* 알림 아이콘 — 이메일 등록 여부를 한눈에. 클릭하면 이메일을 바로 수정한다(BL 재조회 불필요).
       추적이 종료된 건(반납 완료·기간 만료)은 수집 자체가 멈춰 알림이 나가지 않으므로
       종을 비활성으로 그린다 — 켜진 채 두면 "계속 알림이 가는 것"처럼 보인다. */
    var bell = !it.active
      ? '<button class="wf-bell dead" type="button" disabled title="추적 종료 — 알림 발송 안 함' +
        (it.notify_email ? '\n(종료 전 수신: ' + esc(it.notify_email) + ')' : '') + '">' + SVG.bellOff + '</button>'
      : (it.notify_email
        ? '<button class="wf-bell on" type="button" data-mail="' + esc(it.mbl_no) + '" title="알림 수신: ' + esc(it.notify_email) + '\n(클릭하여 변경)">' + SVG.bell + '</button>'
        : '<button class="wf-bell off" type="button" data-mail="' + esc(it.mbl_no) + '" title="알림 없음 — 클릭하여 이메일 등록">' + SVG.bellOff + '</button>');
    return '<tr>' +
      '<td class="cn">' + SVG.box + ' ' + esc(it.mbl_no) + '</td>' +
      '<td title="' + esc(carrierName(it.carrier)) + '">' + esc(it.carrier || '') + (it.carrier && !isLive(it.carrier) ? ' <small style="color:var(--muted);">딥링크</small>' : '') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td class="wf-bell-cell">' + bell + '</td>' +
      '<td>' + esc(s.status || it.last_status || '-') + '</td>' +
      '<td>' + esc([s.por, s.pod].filter(Boolean).join(' → ') || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(s.etd) || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(s.eta) || '-') + '</td>' +
      '<td><button class="wf-hist' + (ch.length ? ' has' : '') + '" type="button" data-hist="' + esc(it.mbl_no) + '" title="' +
        (ch.length ? esc(ch.map(function (c) { return c.field + ': ' + c.old_value + ' → ' + c.new_value; }).join('\n')) + '\n(클릭 — 변경 이력·ETA 추이)' : '변경 이력·ETA 추이 열기') +
        '">' + (ch.length ? ch.length + '건' : '이력') + '</button></td>' +
      '<td class="dt">' + expTxt + '</td>' +
      (watchState.admin ? '<td>' + esc(it.created_by || '-') + '</td>' : '') +
      '<td class="dt">' + esc(fmtShort(it.last_polled_at) || '-') + '</td>' +
      '<td>' + (it.active ? '<button class="btn btn-ghost trk-mini" type="button" data-off="' + esc(it.mbl_no) + '">해제</button>' : '') + '</td>' +
      '</tr>';
  }

  /* ============================================================
     스케줄 변경 피드 + BL 변경 이력·ETA 드리프트 (설계서 축 B)
     KLNET HISTORY 그리드 대응: 내 감시 화물 전체의 최근 변경을 한 피드로.
     행 클릭 상세: 폴링 스냅샷으로 ETA 가 어떻게 밀려왔는지 SVG 계단 차트로 그린다.
     ============================================================ */
  var KIND_LB = { etd: '출항 변경', eta: '도착 변경', vessel: '모선·항차 변경', stage: '진행 상태', gate: '게이트', tml: '터미널 변경' };

  /* 값이 일시로 파싱되면 짧게, 아니면 원문 그대로 (상태 변경 old/new 는 문자열) */
  function chVal(v) { var d = vcDate(v); return isFinite(d) ? fmtShort(v) : String(v || ''); }

  function feedHtml() {
    var rows = [];
    (watchState.items || []).forEach(function (it) {
      (it.changes || []).forEach(function (c) {
        rows.push({ mbl: it.mbl_no, carrier: it.carrier, at: c.changed_at, kind: c.kind, field: c.field, o: c.old_value, n: c.new_value });
      });
    });
    if (!rows.length) return '';
    rows.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    rows = rows.slice(0, 12);
    return '<div class="card trk-card" style="margin-bottom:14px;">' +
      '<div class="trk-head"><span class="trk-bl">스케줄 변경 피드</span>' +
      '<span class="trk-carrier">감시 화물의 최근 변경 ' + rows.length + '건</span>' +
      '<span class="trk-spacer"></span><span class="trk-asof">변경 시 등록 이메일로 자동 발송</span></div>' +
      '<div class="trk-sec" style="padding-top:12px;"><div class="trk-tbl-wrap"><table class="trk-tbl sc-feed">' +
      '<thead><tr><th>기준일시</th><th>이슈</th><th>B/L</th><th>변경 내용</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td class="dt">' + esc(fmtShort(r.at)) + '</td>' +
          '<td><span class="sc-kind k-' + esc(r.kind || 'etc') + '">' + esc(KIND_LB[r.kind] || r.field || '변경') + '</span></td>' +
          '<td class="cn">' + esc(r.mbl) + ' <small style="color:var(--muted);">' + esc(r.carrier || '') + '</small></td>' +
          '<td>' + esc(r.field) + ' · <s class="sc-old">' + esc(chVal(r.o)) + '</s> → <b class="sc-new">' + esc(chVal(r.n)) + '</b></td></tr>';
      }).join('') +
      '</tbody></table></div></div></div>';
  }

  /* ETA 드리프트 — 폴링 회차별 ETA 계단 차트. 값이 클수록(도착이 늦을수록) 위쪽. */
  function driftSvg(snaps) {
    var pts = (snaps || []).map(function (s) { return { at: s.polled_at, v: vcDate(s.eta) }; })
      .filter(function (p) { return isFinite(p.v); });
    if (pts.length < 2) return '';
    var vs = pts.map(function (p) { return p.v; });
    var mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    if (mx === mn) { mn -= 36e5 * 12; mx += 36e5 * 12; }
    var pad = (mx - mn) * 0.18; mn -= pad; mx += pad;
    var W = 760, H = 168, L = 20, R = 96, T = 26, B = 30;
    var xi = function (i) { return L + i * (W - L - R) / (pts.length - 1); };
    var yi = function (v) { return T + (mx - v) / (mx - mn) * (H - T - B); };
    var dfmt = function (v) { var d = new Date(v); return (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); };

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sc-drift" role="img" aria-label="ETA 추이">';
    /* 가로 눈금 3줄 */
    for (var g = 0; g <= 2; g++) {
      var gv = mn + (mx - mn) * g / 2, gy = yi(gv);
      svg += '<line class="d-grid" x1="' + L + '" y1="' + gy + '" x2="' + (W - R + 14) + '" y2="' + gy + '"/>' +
        '<text class="d-ax" x="' + (W - R + 18) + '" y="' + (gy + 4) + '">' + dfmt(gv) + '</text>';
    }
    /* 계단(step-after) 경로 */
    var d = 'M' + xi(0) + ' ' + yi(pts[0].v);
    for (var i = 1; i < pts.length; i++) d += ' H' + xi(i) + ' V' + yi(pts[i].v);
    svg += '<path class="d-line" d="' + d + '"/>';
    /* 점 + 변경 지점 델타 라벨 */
    for (i = 0; i < pts.length; i++) {
      var chg = i > 0 && pts[i].v !== pts[i - 1].v;
      svg += '<circle class="d-dot' + (chg ? ' chg' : '') + '" cx="' + xi(i) + '" cy="' + yi(pts[i].v) + '" r="' + (chg ? 4.5 : 3) + '">' +
        '<title>' + esc(fmtShort(pts[i].at)) + ' 조회 — ETA ' + esc(dfmt(pts[i].v)) + '</title></circle>';
      if (chg) {
        var dd = Math.round((pts[i].v - pts[i - 1].v) / 864e5 * 10) / 10;
        svg += '<text class="d-delta ' + (dd > 0 ? 'late' : 'early') + '" x="' + xi(i) + '" y="' + (yi(pts[i].v) - 9) + '" text-anchor="middle">' +
          (dd > 0 ? '+' : '') + dd + '일</text>';
      }
    }
    var tot = Math.round((pts[pts.length - 1].v - pts[0].v) / 864e5 * 10) / 10;
    svg += '<text class="d-title" x="' + L + '" y="14">ETA 추이 · 조회 ' + pts.length + '회 · 누적 ' +
      (tot > 0 ? '+' : '') + tot + '일</text></svg>';
    return svg;
  }

  function histHtml(d) {
    var sn = (d.snapshots || []).slice().reverse();     /* 서버는 최신순 — 차트는 시간순 */
    var ch = d.changes || [];
    var h = '';
    if (ch.length || sn.length) {
      /* KLNET "PDF 다운로드" 대응 — 브라우저 인쇄(PDF 저장)용 공문을 새 창에 그린다 */
      h += '<div class="sc-tools"><button class="btn btn-ghost trk-mini" type="button" data-notice="1">공문 인쇄 · PDF 저장</button></div>';
    }
    h += driftSvg(sn);
    if (ch.length) {
      h += '<ul class="sc-hlist">' + ch.map(function (c) {
        return '<li><span class="dt">' + esc(fmtShort(c.changed_at)) + '</span>' +
          '<span class="sc-kind k-' + esc(c.kind || 'etc') + '">' + esc(KIND_LB[c.kind] || c.field) + '</span>' +
          '<span>' + esc(c.field) + ' · <s class="sc-old">' + esc(chVal(c.old_value)) + '</s> → <b class="sc-new">' + esc(chVal(c.new_value)) + '</b></span>' +
          (c.notified ? '<i class="sc-sent" title="이메일 발송됨">메일 ✓</i>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (!h) h = '<p class="sc-sub" style="margin:0;">아직 변경 이력이 없습니다 — 다음 수집(08:20·20:20)부터 쌓입니다.</p>';
    return h;
  }

  function toggleHist(btn) {
    var mbl = btn.getAttribute('data-hist');
    var tr = btn.closest('tr'); if (!tr) return;
    var nxt = tr.nextElementSibling;
    if (nxt && nxt.classList.contains('wf-drow')) { nxt.remove(); btn.classList.remove('open'); return; }
    /* 다른 열린 상세는 닫는다 — 한 번에 하나 */
    tr.parentNode.querySelectorAll('.wf-drow').forEach(function (x) { x.remove(); });
    tr.parentNode.querySelectorAll('.wf-hist.open').forEach(function (x) { x.classList.remove('open'); });
    btn.classList.add('open');
    var row = document.createElement('tr');
    row.className = 'wf-drow';
    row.innerHTML = '<td colspan="' + (watchState.admin ? 13 : 12) + '"><div class="wf-dbox">이력 불러오는 중…</div></td>';
    tr.parentNode.insertBefore(row, tr.nextSibling);
    fetch(WATCH_API + '?action=detail&no=' + encodeURIComponent(mbl) + '&token=' + encodeURIComponent(myToken()))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var bx = row.querySelector('.wf-dbox');
        if (!bx) return;
        bx.innerHTML = d.error ? '<p class="sc-sub" style="margin:0;">' + esc(d.error) + '</p>' : histHtml(d);
        var nb = bx.querySelector('button[data-notice]');
        if (nb) nb.addEventListener('click', function () { openNotice(mbl, d); });
      })
      .catch(function () {
        var bx = row.querySelector('.wf-dbox');
        if (bx) bx.textContent = '이력 조회 실패 — 잠시 후 다시.';
      });
  }

  /* ============================================================
     스케줄 변경 공문 (P8) — KLNET "Vessel Schedule Change History" 대응.
     새 창에 인쇄 전용 레이아웃을 그리고, 사용자는 브라우저 인쇄로 PDF 저장.
     외부 라이브러리 없이 공문 품질을 내는 가장 가벼운 경로다.
     ============================================================ */
  function openNotice(mbl, d) {
    var it = findWatch(mbl) || {};
    var s0 = it.snapshot || {};
    var sn = (d.snapshots || [])[0] || {};
    var ch = d.changes || [];
    var now = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var today = now.getFullYear() + '.' + pad(now.getMonth() + 1) + '.' + pad(now.getDate()) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var vessel = (sn.vessel || s0.vessel || '') + (sn.voyage || s0.voyage ? ' ' + (sn.voyage || s0.voyage) : '');
    var route = [s0.por, s0.pod].filter(Boolean).join(' → ');

    var histRows = ch.length
      ? ch.map(function (c) {
          return '<tr><td>' + esc(fmtShort(c.changed_at)) + '</td><td>' + esc(KIND_LB[c.kind] || c.field) + '</td>' +
            '<td>' + esc(c.field) + '</td><td class="old">' + esc(chVal(c.old_value)) + '</td>' +
            '<td class="new">' + esc(chVal(c.new_value)) + '</td></tr>';
        }).join('')
      : (d.snapshots || []).map(function (s) {
          return '<tr><td>' + esc(fmtShort(s.polled_at)) + '</td><td>조회</td><td>ETD / ETA</td>' +
            '<td colspan="2">' + esc(chVal(s.etd)) + ' / ' + esc(chVal(s.eta)) + '</td></tr>';
        }).join('');

    var html = '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">' +
      '<title>Schedule Change Notice — ' + esc(mbl) + '</title><style>' +
      'body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;color:#111;margin:48px 54px;line-height:1.55;}' +
      '.hd{display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #0f2f5c;padding-bottom:10px;}' +
      '.hd b{font-size:19px;letter-spacing:.04em;color:#0f2f5c;} .hd small{color:#666;}' +
      'h1{font-size:16.5px;margin:26px 0 4px;} h1 small{display:block;font-size:12px;color:#555;font-weight:400;margin-top:2px;}' +
      'table{border-collapse:collapse;width:100%;margin-top:14px;font-size:12.5px;}' +
      'th,td{border:1px solid #c9cfd8;padding:6px 9px;text-align:left;}' +
      'th{background:#eef2f7;font-weight:700;white-space:nowrap;}' +
      '.meta th{width:110px;} .old{color:#a33;text-decoration:line-through;} .new{color:#0a6b2d;font-weight:700;}' +
      '.note{font-size:11.5px;color:#666;margin-top:20px;border-top:1px solid #ddd;padding-top:10px;}' +
      '.btn{margin-top:22px;padding:9px 20px;font-size:13px;cursor:pointer;}' +
      '@media print{.btn{display:none;} body{margin:14mm 16mm;}}' +
      '</style></head><body>' +
      '<div class="hd"><b>TAEWOONG LOGISTICS<br><span style="font-size:11.5px;letter-spacing:.14em;">TWL CONTROL TOWER</span></b>' +
      '<small>DATE : ' + esc(today) + '</small></div>' +
      '<h1>VESSEL SCHEDULE CHANGE NOTICE<small>본선 스케줄 변경 통지</small></h1>' +
      '<p style="font-size:12.5px;">To : Valued Customer<br>Re : Schedule Change Notice — ' + esc(vessel || mbl) + '</p>' +
      '<p style="font-size:12.5px;">We hereby notify you of the schedule change(s) below.<br>아래와 같이 본선 스케줄 변경 사항을 알려드립니다.</p>' +
      '<table class="meta">' +
      '<tr><th>MBL No.</th><td>' + esc(mbl) + '</td><th>선사</th><td>' + esc(carrierName(it.carrier) || it.carrier || '-') + '</td></tr>' +
      '<tr><th>본선 / 항차</th><td>' + esc(vessel || '-') + '</td><th>구간</th><td>' + esc(route || '-') + '</td></tr>' +
      '<tr><th>현재 ETD</th><td>' + esc(chVal(sn.etd || s0.etd) || '-') + '</td><th>현재 ETA</th><td>' + esc(chVal(sn.eta || s0.eta) || '-') + '</td></tr>' +
      '</table>' +
      '<table><thead><tr><th>기준일시</th><th>구분</th><th>항목</th><th>변경 전</th><th>변경 후</th></tr></thead>' +
      '<tbody>' + (histRows || '<tr><td colspan="5">기록 없음</td></tr>') + '</tbody></table>' +
      '<p class="note">This notice is generated by TWL Control Tower based on carrier tracking feeds and Korean terminal berth schedules. ' +
      'It may differ from the carrier\'s official announcement.<br>' +
      '본 통지는 선사 트래킹 데이터와 국내 터미널 선석 스케줄을 기반으로 자동 생성되었으며, 선사 공식 공지와 다를 수 있습니다. ' +
      '문의: 태웅로직스 (itt@twsc.co.kr)</p>' +
      '<button class="btn" onclick="window.print()">인쇄 / PDF 저장</button>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('팝업이 차단되었습니다 — 브라우저 팝업 허용 후 다시 시도하십시오.'); return; }
    w.document.write(html);
    w.document.close();
  }

  function watchSummarySet(html) {
    var ws = el('watchSummary'); if (ws) ws.innerHTML = html;
  }
  function renderWatch() {
    var box = el('watchOut'); if (!box) return;
    var all = watchState.items;
    if (watchState.needLogin) {
      watchSummarySet('<span class="cs-muted">로그인 후 이용 가능</span>');
      box.innerHTML = '<div class="card"><p class="sc-sub" style="margin:0;">추적 감시는 <b>로그인 후</b> 이용할 수 있습니다. ' +
        '등록한 화물은 <b>본인에게만</b> 보이며, 관리자는 전체를 조회할 수 있습니다.</p></div>';
      return;
    }
    if (!all.length) {
      watchSummarySet('등록 <b>0</b>건');
      /* 비어 있어도 일괄 등록 버튼은 반드시 보여야 한다 — 첫 등록의 진입점이기 때문 */
      box.innerHTML = '<div class="card trk-card">' +
        '<div class="trk-head"><span class="trk-bl">추적 등록 화물</span>' +
        '<span class="trk-carrier">등록 0건</span><span class="trk-spacer"></span>' +
        '<button class="btn btn-primary" id="wf_bulk" type="button">' + SVG.upload + ' 일괄 등록</button></div>' +
        '<div class="trk-sec" style="padding-top:16px;"><p class="sc-sub" style="margin:0;">' +
        '등록된 추적 화물이 없습니다. 위에서 B/L 을 조회한 뒤 <b>추적 등록</b>을 누르거나, 오른쪽 위 <b>일괄 등록</b>으로 여러 건을 한 번에 넣으세요. ' +
        '스케줄러가 매일 08:20 / 20:20 에 조회해 <b>출항·도착 예정일시가 바뀌면 메일로 알려드립니다.</b></p></div></div>';
      var b0 = el('wf_bulk');
      if (b0) b0.addEventListener('click', openBulkDialog);
      return;
    }
    var rows = watchFiltered();
    var total = rows.length, pages = Math.max(1, Math.ceil(total / WATCH_PAGE));
    if (watchState.page > pages) watchState.page = pages;
    var start = (watchState.page - 1) * WATCH_PAGE;
    var pageRows = rows.slice(start, start + WATCH_PAGE);
    var actCnt = all.filter(function (x) { return x.active; }).length;
    watchSummarySet('감시 중 <b>' + actCnt + '</b>건 · 전체 ' + all.length + '건');
    var carrierOpts = ['<option value="">전체 선사</option>'].concat(
      Array.from(new Set(all.map(function (x) { return x.carrier; }).filter(Boolean))).sort()
        .map(function (c) { return '<option value="' + esc(c) + '"' + (watchState.carrier === c ? ' selected' : '') + '>' + esc(c) + '</option>'; })).join('');
    /* 진행상태 옵션은 실제 데이터에서 뽑는다(운송중·입항·양하·선적 등) */
    var statusOpts = ['<option value="">진행 전체</option>'].concat(
      Array.from(new Set(all.map(progOf).filter(Boolean))).sort()
        .map(function (st) { return '<option value="' + esc(st) + '"' + (watchState.status === st ? ' selected' : '') + '>' + esc(st) + '</option>'; })).join('');
    var sortOpts = [['reg', '등록순'], ['etd', 'ETD 순'], ['eta', 'ETA 순'], ['exp', '남은기간 순']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (watchState.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    var hasFilter = watchState.q || watchState.carrier || watchState.status || watchState.route || watchState.active !== 'all';

    var h = feedHtml() +
      '<div class="card trk-card">' +
      '<div class="trk-head">' +
      '<span class="trk-bl">추적 등록 화물</span>' +
      '<span class="trk-carrier">감시 중 ' + actCnt + '건 / 전체 ' + all.length + '건</span>' +
      (watchState.admin ? '<span class="trk-badge is-move">관리자 · 전체 조회</span>'
        : '<span class="trk-carrier">' + esc(watchState.me || '') + ' 등록분</span>') +
      '<span class="trk-spacer"></span>' +
      '<span class="trk-asof">매일 08:20 · 20:20 · ETD/ETA 변경 시 메일</span>' +
      '</div>' +
      /* 툴바: 검색·선사·진행·구간·정렬 필터 + 일괄등록 (선석배정 조회 영역 사상) */
      '<div class="berth-toolbar" style="margin:0; padding:12px 18px; border-bottom:1px solid var(--border); flex-wrap:wrap; gap:8px;">' +
      '<input type="search" id="wf_q" class="focus-search" placeholder="B/L·메모 검색" value="' + esc(watchState.q) + '" style="max-width:180px;">' +
      '<select id="wf_carrier" class="focus-search" style="max-width:130px;">' + carrierOpts + '</select>' +
      '<select id="wf_status" class="focus-search" style="max-width:130px;">' + statusOpts + '</select>' +
      '<input type="search" id="wf_route" class="focus-search" placeholder="구간(항구) 검색" value="' + esc(watchState.route) + '" style="max-width:150px;">' +
      '<div class="chip-row" style="margin:0;">' +
      '<button class="f-chip' + (watchState.active === 'all' ? '' : ' off') + '" data-act="all">전체</button>' +
      '<button class="f-chip' + (watchState.active === 'on' ? '' : ' off') + '" data-act="on">감시 중</button>' +
      '<button class="f-chip' + (watchState.active === 'off' ? '' : ' off') + '" data-act="off">종료</button>' +
      '</div>' +
      (hasFilter ? '<button class="btn btn-ghost trk-mini" id="wf_reset" type="button">필터 초기화</button>' : '') +
      '<span class="trk-spacer"></span>' +
      '<select id="wf_sort" class="focus-search" style="max-width:120px;">' + sortOpts + '</select>' +
      '<button class="btn btn-ghost" id="wf_bulk" type="button">' + SVG.upload + ' 일괄 등록</button>' +
      '</div>' +
      '<div class="trk-sec" style="padding-top:14px;"><div class="trk-tbl-wrap"><table class="trk-tbl">' +
      '<thead><tr><th>B/L No.</th><th>선사</th><th>상태</th><th title="이메일 알림 등록 여부 · 클릭하여 변경">알림</th><th>진행</th><th>구간</th><th>ETD</th><th>ETA</th>' +
      '<th>변경</th><th>남은기간</th>' + (watchState.admin ? '<th>등록자</th>' : '') + '<th>최근 수집</th><th></th></tr></thead><tbody>' +
      (pageRows.length ? pageRows.map(watchRowHtml).join('') : '<tr><td colspan="' + (watchState.admin ? 13 : 12) + '" class="na" style="text-align:center;padding:18px;">조건에 맞는 화물이 없습니다.</td></tr>') +
      '</tbody></table></div>' +
      /* 페이지네이션 */
      (pages > 1 ? '<div class="wf-pager">' +
        '<button class="btn btn-ghost trk-mini" id="wf_prev"' + (watchState.page <= 1 ? ' disabled' : '') + '>이전</button>' +
        '<span class="wf-page">' + watchState.page + ' / ' + pages + ' <small>(' + total + '건)</small></span>' +
        '<button class="btn btn-ghost trk-mini" id="wf_next"' + (watchState.page >= pages ? ' disabled' : '') + '>다음</button>' +
        '</div>' : '') +
      '</div></div>';
    box.innerHTML = h;

    /* 이벤트 바인딩 */
    var qEl = el('wf_q');
    if (qEl) qEl.addEventListener('input', debounce(function () { watchState.q = qEl.value; watchState.page = 1; renderWatch(); }, 250));
    var cEl = el('wf_carrier');
    if (cEl) cEl.addEventListener('change', function () { watchState.carrier = cEl.value; watchState.page = 1; renderWatch(); });
    var stEl = el('wf_status');
    if (stEl) stEl.addEventListener('change', function () { watchState.status = stEl.value; watchState.page = 1; renderWatch(); });
    var rtEl = el('wf_route');
    if (rtEl) rtEl.addEventListener('input', debounce(function () { watchState.route = rtEl.value; watchState.page = 1; renderWatch(); }, 250));
    var srtEl = el('wf_sort');
    if (srtEl) srtEl.addEventListener('change', function () { watchState.sort = srtEl.value; renderWatch(); });
    var rst = el('wf_reset');
    if (rst) rst.addEventListener('click', function () {
      watchState.q = ''; watchState.carrier = ''; watchState.status = ''; watchState.route = ''; watchState.active = 'all'; watchState.page = 1; renderWatch();
    });
    box.querySelectorAll('.f-chip[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { watchState.active = btn.getAttribute('data-act'); watchState.page = 1; renderWatch(); });
    });
    var pv = el('wf_prev'), nx = el('wf_next');
    if (pv) pv.addEventListener('click', function () { if (watchState.page > 1) { watchState.page--; renderWatch(); } });
    if (nx) nx.addEventListener('click', function () { watchState.page++; renderWatch(); });
    var bulk = el('wf_bulk');
    if (bulk) bulk.addEventListener('click', openBulkDialog);
    /* 알림 종 클릭 — 목록에서 바로 수신 이메일을 등록·변경·해제한다(BL 재조회 불필요) */
    box.querySelectorAll('button[data-mail]').forEach(function (btn) {
      btn.addEventListener('click', function () { openNotifyDialog(btn.getAttribute('data-mail')); });
    });
    /* 변경 칸 클릭 — 행 아래로 변경 이력 + ETA 추이 확장 */
    box.querySelectorAll('button[data-hist]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleHist(btn); });
    });
    box.querySelectorAll('button[data-off]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mbl = btn.getAttribute('data-off');
        openConfirm({
          title: '추적 해제', sub: mbl, ok: '해제',
          body: '이후 <b>수집과 알림이 중단</b>됩니다.<br>지금까지의 조회 이력과 변경 기록은 그대로 남습니다.'
        }, function (setErr, close) {
          fetch(WATCH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', token: myToken(), mbl_no: mbl }) })
            .then(function (r) { return r.json(); })
            .then(function (d) { if (d.error) { setErr(d.error); return; } close(); loadWatchList(); })
            .catch(function () { setErr('해제 실패 — 잠시 후 다시 시도하십시오.'); });
        });
      });
    });
  }

  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  function loadWatchList() {
    var box = el('watchOut'); if (!box) return;
    loadCarriers(function () {
      fetch(WATCH_API + '?action=list&token=' + encodeURIComponent(myToken())).then(function (r) { return r.json(); }).then(function (d) {
        watchState.items = d.items || [];
        watchState.me = d.me || null;
        watchState.admin = !!d.admin;
        watchState.needLogin = !!d.needLogin;
        renderWatch();
        syncWatchBtn();      // 조회 결과가 이미 떠 있으면 등록 상태를 버튼에 반영
      }).catch(function () { box.innerHTML = '<div class="card"><p class="sc-sub" style="margin:0;">추적 목록을 불러오지 못했습니다.</p></div>'; });
    });
  }

  /* 확인 다이얼로그 — 브라우저 confirm() 대신 사이트 모달.
     onOk 는 (setErr, close) 를 받아 실패 시 모달 안에 사유를 표시할 수 있다. */
  function openConfirm(opts, onOk) {
    var ov = document.createElement('div');
    ov.className = 'reg-ov';
    ov.innerHTML = '<div class="reg-card" style="max-width:380px;">' +
      '<h3>' + esc(opts.title || '확인') + (opts.sub ? ' <small>' + esc(opts.sub) + '</small>' : '') + '</h3>' +
      '<p class="reg-hint" style="font-size:12.5px;">' + (opts.body || '') + '</p>' +
      '<div id="cfMsg" class="reg-msg"></div>' +
      '<div class="reg-btns"><button class="btn btn-ghost" id="cfCancel">취소</button>' +
      '<button class="btn btn-primary" id="cfOk">' + esc(opts.ok || '확인') + '</button></div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    el2(ov, 'cfCancel').addEventListener('click', close);
    el2(ov, 'cfOk').addEventListener('click', function () {
      var b = el2(ov, 'cfOk');
      b.disabled = true; b.textContent = '처리 중…';
      onOk(function (err) {
        el2(ov, 'cfMsg').innerHTML = '<span class="reg-err">' + esc(err) + '</span>';
        b.disabled = false; b.textContent = opts.ok || '확인';
      }, close);
    });
  }

  /* 알림 수신 이메일 다이얼로그 — 브라우저 prompt() 대신 사이트 모달을 쓴다 */
  function openNotifyDialog(mbl) {
    var it = findWatch(mbl) || {};
    var cur = it.notify_email || '';
    var ov = document.createElement('div');
    ov.className = 'reg-ov';
    ov.innerHTML = '<div class="reg-card">' +
      '<h3>알림 수신 설정 <small>' + esc(mbl) + '</small></h3>' +
      '<p class="reg-hint" style="margin:0 0 4px;">출항·도착 예정일시(ETD/ETA)가 바뀌면 이 주소로 메일을 보냅니다.</p>' +
      '<label class="reg-l">알림 이메일 <span class="reg-opt">(비우고 저장하면 알림 해제)</span></label>' +
      '<input type="email" id="ntMail" class="focus-search" style="width:100%;" placeholder="you@twsc.co.kr" value="' + esc(cur || myEmail()) + '">' +
      (cur ? '<p class="reg-hint">현재 수신: <b>' + esc(cur) + '</b></p>' : '<p class="reg-hint">현재 알림이 설정돼 있지 않습니다.</p>') +
      '<div id="ntMsg" class="reg-msg"></div>' +
      '<div class="reg-btns">' +
      (cur ? '<button class="btn btn-ghost" id="ntClear">알림 해제</button>' : '') +
      '<button class="btn btn-ghost" id="ntCancel">취소</button>' +
      '<button class="btn btn-primary" id="ntOk">저장</button></div></div>';
    document.body.appendChild(ov);
    function close() { ov.remove(); }
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    el2(ov, 'ntCancel').addEventListener('click', close);
    var input = el2(ov, 'ntMail');
    input.focus(); input.select();
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') el2(ov, 'ntOk').click(); });

    function save(val) {
      var msg = el2(ov, 'ntMsg'), ok = el2(ov, 'ntOk');
      ok.disabled = true; ok.textContent = '저장 중…';
      fetch(WATCH_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'notify', token: myToken(), mbl_no: mbl, notify_email: val })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) { msg.innerHTML = '<span class="reg-err">' + esc(d.error) + '</span>'; ok.disabled = false; ok.textContent = '저장'; return; }
        close(); loadWatchList();
      }).catch(function () {
        msg.innerHTML = '<span class="reg-err">네트워크 오류 — 잠시 후 다시.</span>'; ok.disabled = false; ok.textContent = '저장';
      });
    }
    el2(ov, 'ntOk').addEventListener('click', function () { save(input.value.trim()); });
    var clr = el2(ov, 'ntClear');
    if (clr) clr.addEventListener('click', function () { save(''); });
  }

  /* 일괄 등록 다이얼로그 — BL 목록 붙여넣기(줄바꿈/쉼표 구분) */
  function openBulkDialog() {
    loadCarriers(function () {
      var live = ((watchState.carriers || {}).live || []).map(function (x) { return x.scac + '(' + x.name + ')'; }).join(' · ');
      var ov = document.createElement('div'); ov.className = 'reg-ov';
      ov.innerHTML = '<div class="reg-card" style="max-width:560px;">' +
        '<h3>B/L 일괄 등록</h3>' +
        '<p class="reg-hint">B/L 번호를 <b>줄바꿈 또는 쉼표</b>로 구분해 붙여넣으세요 (최대 500건). 선사는 번호로 자동 판별됩니다.</p>' +
        '<div class="reg-support"><b>실시간 조회:</b> ' + esc(live) + '<br><span style="color:var(--muted);">그 외 선사는 등록되어도 목록에만 표시되고 자동 조회는 되지 않습니다.</span></div>' +
        '<textarea id="bulkTxt" class="focus-search" style="width:100%; min-height:150px; font-family:monospace; resize:vertical;" placeholder="COSU6504130030&#10;SMLMSEL6C8710500&#10;ONEYSELG97346400"></textarea>' +
        '<div class="reg-row"><div><label class="reg-l">추적 기간</label>' +
        '<div class="reg-seg" id="bulkTerm"><button data-m="3" class="on">3개월</button><button data-m="6">6개월</button></div></div>' +
        '<div style="flex:1;"><label class="reg-l">알림 이메일 <span class="reg-opt">(선택)</span></label>' +
        '<input type="email" id="bulkMail" class="focus-search" value="' + esc(myEmail()) + '" style="width:100%;"></div></div>' +
        '<div id="bulkMsg" class="reg-msg"></div>' +
        '<div class="reg-btns"><button class="btn btn-ghost" id="bulkCancel">취소</button>' +
        '<button class="btn btn-primary" id="bulkOk">등록</button></div></div>';
      document.body.appendChild(ov);
      var term = 3;
      ov.querySelectorAll('#bulkTerm button').forEach(function (x) {
        x.addEventListener('click', function () { term = Number(x.getAttribute('data-m')); ov.querySelectorAll('#bulkTerm button').forEach(function (y) { y.classList.remove('on'); }); x.classList.add('on'); });
      });
      function close() { ov.remove(); }
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      el2(ov, 'bulkCancel').addEventListener('click', close);
      el2(ov, 'bulkOk').addEventListener('click', function () {
        var raw = el2(ov, 'bulkTxt').value.split(/[\s,;]+/).map(function (x) { return x.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); }).filter(Boolean);
        var uniq = Array.from(new Set(raw));
        var msg = el2(ov, 'bulkMsg');
        if (!uniq.length) { msg.innerHTML = '<span class="reg-err">등록할 B/L 이 없습니다.</span>'; return; }
        el2(ov, 'bulkOk').disabled = true; el2(ov, 'bulkOk').textContent = '등록 중… (' + uniq.length + '건)';
        fetch(WATCH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk', token: myToken(), term_months: term, notify_email: el2(ov, 'bulkMail').value.trim(), rows: uniq.map(function (m) { return { mbl_no: m }; }) }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (d.error) { msg.innerHTML = '<span class="reg-err">' + esc(d.error) + '</span>'; el2(ov, 'bulkOk').disabled = false; el2(ov, 'bulkOk').textContent = '등록'; return; }
            msg.innerHTML = '<span class="reg-ok">등록 ' + d.added + '건 · 실패 ' + d.failed + '건</span>' +
              (d.failed ? '<div class="reg-fail">' + (d.results || []).filter(function (x) { return !x.ok; }).map(function (x) { return esc(x.mbl_no) + ' — ' + esc(x.error); }).join('<br>') + '</div>' : '');
            loadWatchList();
            if (!d.failed) setTimeout(close, 800);
            else { el2(ov, 'bulkOk').disabled = false; el2(ov, 'bulkOk').textContent = '닫기'; el2(ov, 'bulkOk').onclick = close; }
          }).catch(function () { msg.innerHTML = '<span class="reg-err">네트워크 오류.</span>'; el2(ov, 'bulkOk').disabled = false; el2(ov, 'bulkOk').textContent = '등록'; });
      });
    });
  }


  /* 딥링크 카드 — live 미지원 선사·항공사 (외부 공식 추적 페이지로 안내) */
  function renderDeeplink(title, name, url, note) {
    var sh = el('statusHero'); if (sh) sh.innerHTML = '';
    el('carrierOut').innerHTML = '<div class="card reveal in" style="margin-bottom:14px;">' +
      '<h3 style="margin-top:0;">' + esc(title) + (name ? ' <small style="color:var(--muted);">' + esc(name) + '</small>' : '') + '</h3>' +
      '<p class="sc-sub">' + esc(note) + '</p>' +
      (url ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + url + '">' + esc(name || '') + ' 공식 추적 페이지 ↗</a>' : '') +
      '</div>';
  }

  function trace() {
    var no = el('blNo').value.trim();
    if (no.length < 6) return;
    var em = el('ccEmpty'); if (em) em.style.display = 'none';
    var awb = awbInfo(no);
    var oc = oceanInfo(no);
    el('awbHint').innerHTML = awb
      ? ('AWB 감지 (프리픽스 ' + awb.prefix + (awb.name ? ' · ' + esc(awb.name) : '') + ')')
      : (oc && oc.name
        ? (LIVE_SCACS[oc.scac]
          ? ('해상 선사 감지 (' + oc.scac + ' · ' + esc(oc.name) + ') — 운송 이벤트를 선사에서 직접 조회합니다.')
          : ('해상 선사 감지 (' + oc.scac + ' · ' + esc(oc.name) + ') — 이 선사는 공식 추적 페이지에서 확인합니다.'))
        : '');
    if (awb) {
      renderDeeplink('항공 화물 추적', awb.name || ('항공사 프리픽스 ' + awb.prefix), awb.url,
        awb.name ? 'AWB ' + no + ' — 항공사 공식 추적 페이지에서 조회하십시오.' : '등록되지 않은 항공사 프리픽스입니다. 아래 무료 조회 채널을 이용하십시오.');
      return;
    }
    if (oc && LIVE_SCACS[oc.scac]) {
      el('carrierOut').innerHTML = '<div class="card reveal in" style="margin-bottom:14px;"><div class="sc-sub">선사 운송 정보 조회 중…</div></div>';
      fetch(CARRIER_API + '?no=' + encodeURIComponent(no))
        .then(function (r) { return r.json(); })
        .then(function (res) { renderCarrier(res, no); })
        .catch(function () { renderCarrier({ error: '일시적 네트워크 오류입니다 — 잠시 후 다시 시도하십시오.' }, no); });
      return;
    }
    if (oc && oc.name) {
      renderDeeplink('선사 운송 추적', oc.name, oc.url,
        'MBL ' + no + ' — 이 선사는 봇 차단 정책상 사이트 내 실조회가 불가하여 공식 페이지로 안내합니다.');
      return;
    }
    renderDeeplink('선사 미감지', null, null,
      '번호에서 선사를 식별하지 못했습니다. 실조회 지원: ONE·COSCO·SM상선·Evergreen·SITC·ZIM(키 등록 시 머스크·하파그로이드·HMM 자동 확장) / 그 외 선사는 딥링크. 번호를 확인하거나 아래 무료 조회 채널을 이용하십시오.');
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('traceBtn').addEventListener('click', trace);
    /* 바로가기 채널 서랍 — 43개 링크벽을 상시 노출에서 강등(UX 개편) */
    var qlO = el('qlOpen'), qlD = el('qlDrawer'), qlC = el('qlClose'), qlB = el('qlBack');
    function qlToggle(show) {
      if (!qlD) return;
      qlD.hidden = !show; if (qlB) qlB.hidden = !show;
      document.body.style.overflow = show ? 'hidden' : '';
    }
    if (qlO) qlO.addEventListener('click', function () { qlToggle(true); });
    if (qlC) qlC.addEventListener('click', function () { qlToggle(false); });
    if (qlB) qlB.addEventListener('click', function () { qlToggle(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') qlToggle(false); });
    el('blNo').addEventListener('keydown', function (e) { if (e.key === 'Enter') trace(); });
    loadWatchList();
    /* ?no= 딥링크 — 알림 메일의 "포털에서 확인" 버튼이 이 경로로 들어온다(P8).
       입력창에 채우고 즉시 조회까지 실행해, 링크 하나로 결과 화면에 도달한다. */
    try {
      var qno = new URLSearchParams(location.search).get('no');
      if (qno && qno.length >= 6) { el('blNo').value = qno; trace(); }
    } catch (e) { /* 구형 브라우저 — 무시 */ }
  });
})();
