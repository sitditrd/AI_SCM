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
     — 2026-08-11 태웅 실 MBL 검증 완료: ONE·COSCO·SM상선·Evergreen·SITC */
  var LIVE_SCACS = { ONEY: 1, COSU: 1, SMLM: 1, EGLV: 1, SITC: 1 };

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
    bell: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M18 8.5a6 6 0 10-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5"/><path d="M13.7 20a2 2 0 01-3.4 0"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M20 6L9 17l-5-5"/></svg>',
    upload: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v13"/></svg>'
  };

  /* 경로 시각화 — 항차(voyages)가 있으면 그 구간을, 없으면 POL→POD 단일 구간 */
  function routeHtml(res, doneRatio) {
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
    /* 연속 동일 항구는 하나로 합친다 — 환적 구간이 A→B, B→C 로 오면 B 가 두 번 잡힌다(실측).
       뒤엣것(다음 구간 출발)의 일시를 남겨 "언제 다시 떠났는지"가 보이게 한다. */
    pts = pts.filter(function (p, i, a) {
      return i === 0 || String(p.nm).toUpperCase() !== String(a[i - 1].nm).toUpperCase();
    });
    if (pts.length < 2) return '';

    /* 선박 마커는 마지막 실적 지점과 다음 지점 사이에 놓는다 */
    var lastAct = -1;
    pts.forEach(function (p, i) { if (p.act) lastAct = i; });

    var h = '<div class="trk-route">';
    pts.forEach(function (p, i) {
      if (i > 0) {
        var filled = (i - 1) < lastAct ? 100 : ((i - 1) === lastAct ? 55 : 0);
        h += '<div class="trk-leg"><span class="l-fill" style="width:' + filled + '%;"></span>' +
          ((i - 1) === lastAct && lastAct < pts.length - 1
            ? '<span class="l-ship" style="left:55%;">' + SVG.ship + '</span>' : '') + '</div>';
      }
      var nm = String(p.nm || '');
      var code = (/^[A-Z]{5}$/.test(nm) ? nm : nm.split(/[,(]/)[0].trim().slice(0, 14)).toUpperCase();
      h += '<div class="trk-port' + (p.act ? ' done' : '') + '">' +
        '<span class="p-dot">' + SVG.anchor + '</span>' +
        '<span class="p-cd">' + esc(code) + '</span>' +
        (nm && nm.toUpperCase() !== code ? '<span class="p-nm" title="' + esc(nm) + '">' + esc(nm) + '</span>' : '') +
        (p.dt ? '<span class="p-dt' + (p.act ? ' act' : '') + '">' + esc(fmtShort(p.dt)) + '</span>' : '') +
        '</div>';
    });
    return h + '</div>';
  }

  function renderCarrier(res, no) {
    var out = el('carrierOut');
    if (!res || res.error) {
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

    /* ② 경로 */
    h += routeHtml(res, idx / (SLOTS.length - 1));

    /* ③ 컨테이너별 게이트 이벤트 표 */
    if (cs.length) {
      var depCols = SLOTS.filter(function (x) { return x.grp === 'dep'; });
      var arrCols = SLOTS.filter(function (x) { return x.grp === 'arr'; });
      h += '<div class="trk-sec"><h4>컨테이너 ' + cs.length + '건 · 게이트 이벤트</h4><div class="trk-tbl-wrap"><table class="trk-tbl">' +
        '<thead><tr class="grp"><th rowspan="2">컨테이너</th><th rowspan="2">타입</th>' +
        '<th class="dep" colspan="' + depCols.length + '">' + SVG.out + ' 출발지 (DEPARTURE)</th>' +
        '<th class="arr" colspan="' + arrCols.length + '">' + SVG.into + ' 도착지 (DESTINATION)</th></tr><tr>' +
        SLOTS.map(function (x) { return '<th>' + x.label + '</th>'; }).join('') +
        '</tr></thead><tbody>';
      cs.forEach(function (c) {
        var sl = toSlots(c.events);
        h += '<tr><td class="cn">' + SVG.box + ' ' + esc(c.cntrNo || '') + '</td><td>' + esc(c.szTp || '') + '</td>' +
          SLOTS.map(function (x) {
            var e = sl[x.k];
            if (!e) return '<td class="dt na">-</td>';
            var t = fmtShort(e.timeLocal || e.timeUtc);
            return '<td class="dt' + (e.actual ? ' act' : '') + '" title="' + esc(evName(e.name)) + (e.location ? ' · ' + esc(e.location) : '') + '">' + esc(t || '●') + '</td>';
          }).join('') + '</tr>';
      });
      h += '</tbody></table></div>';

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

    h += '<div class="trk-head" style="border-bottom:0; border-top:1px solid var(--border);">' +
      '<span class="trk-asof">데이터 시점 ' + esc(fmtIso(res.fetchedAt)) + ' UTC · 출처 ' + esc(res.source || '') + ' · 시각은 항만 현지 기준</span></div>';
    h += '</div>';
    out.innerHTML = h;
    bindWatchBtn();
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
    return '<tr>' +
      '<td class="cn">' + SVG.box + ' ' + esc(it.mbl_no) + '</td>' +
      '<td title="' + esc(carrierName(it.carrier)) + '">' + esc(it.carrier || '') + (it.carrier && !isLive(it.carrier) ? ' <small style="color:var(--muted);">딥링크</small>' : '') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + esc(s.status || it.last_status || '-') + '</td>' +
      '<td>' + esc([s.por, s.pod].filter(Boolean).join(' → ') || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(s.etd) || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(s.eta) || '-') + '</td>' +
      '<td>' + (ch.length
        ? '<span title="' + esc(ch.map(function (c) { return c.field + ': ' + c.old_value + ' → ' + c.new_value; }).join('\n')) + '" style="color:var(--up);font-weight:700;">' + ch.length + '건</span>'
        : '<span class="na">-</span>') + '</td>' +
      '<td class="dt">' + expTxt + '</td>' +
      (watchState.admin ? '<td>' + esc(it.created_by || '-') + '</td>' : '') +
      '<td>' + esc(it.notify_email || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(it.last_polled_at) || '-') + '</td>' +
      '<td>' + (it.active ? '<button class="btn btn-ghost trk-mini" type="button" data-off="' + esc(it.mbl_no) + '">해제</button>' : '') + '</td>' +
      '</tr>';
  }

  function renderWatch() {
    var box = el('watchOut'); if (!box) return;
    var all = watchState.items;
    if (watchState.needLogin) {
      box.innerHTML = '<div class="card"><p class="sc-sub" style="margin:0;">추적 감시는 <b>로그인 후</b> 이용할 수 있습니다. ' +
        '등록한 화물은 <b>본인에게만</b> 보이며, 관리자는 전체를 조회할 수 있습니다.</p></div>';
      return;
    }
    if (!all.length) {
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

    var h = '<div class="card trk-card">' +
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
      '<thead><tr><th>B/L No.</th><th>선사</th><th>상태</th><th>진행</th><th>구간</th><th>ETD</th><th>ETA</th>' +
      '<th>변경</th><th>남은기간</th>' + (watchState.admin ? '<th>등록자</th>' : '') + '<th>알림 수신</th><th>최근 수집</th><th></th></tr></thead><tbody>' +
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
    box.querySelectorAll('button[data-off]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mbl = btn.getAttribute('data-off');
        if (!window.confirm(mbl + ' 추적을 해제할까요?\n(기록은 남고 이후 수집·알림만 중단됩니다)')) return;
        btn.disabled = true;
        fetch(WATCH_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', token: myToken(), mbl_no: mbl }) })
          .then(function (r) { return r.json(); })
          .then(function (d) { if (d.error) { btn.disabled = false; alert(d.error); return; } loadWatchList(); })
          .catch(function () { btn.disabled = false; alert('해제 실패 — 잠시 후 다시.'); });
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
    el('carrierOut').innerHTML = '<div class="card reveal in" style="margin-bottom:14px;">' +
      '<h3 style="margin-top:0;">' + esc(title) + (name ? ' <small style="color:var(--muted);">' + esc(name) + '</small>' : '') + '</h3>' +
      '<p class="sc-sub">' + esc(note) + '</p>' +
      (url ? '<a class="btn btn-primary" target="_blank" rel="noopener" href="' + url + '">' + esc(name || '') + ' 공식 추적 페이지 ↗</a>' : '') +
      '</div>';
  }

  function trace() {
    var no = el('blNo').value.trim();
    if (no.length < 6) return;
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
      '번호에서 선사를 식별하지 못했습니다. 실조회 지원: ONE·COSCO / 딥링크: Maersk·MSC·HMM 등 12사. 번호를 확인하거나 아래 무료 조회 채널을 이용하십시오.');
  }

  document.addEventListener('DOMContentLoaded', function () {
    el('traceBtn').addEventListener('click', trace);
    el('blNo').addEventListener('keydown', function (e) { if (e.key === 'Enter') trace(); });
    loadWatchList();
  });
})();
