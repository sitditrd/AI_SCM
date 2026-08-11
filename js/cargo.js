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
      '<path d="M20 6L9 17l-5-5"/></svg>'
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
     추적 등록(감시) — 등록해두면 스케줄러가 1일 2회 조회해 ETD/ETA 변경 시 메일 발송
     ============================================================ */
  var WATCH_API = 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/bl-watch';

  function myEmail() {
    /* 로그인 세션의 이메일을 기본 수신처로 쓴다 */
    try {
      var s = JSON.parse(localStorage.getItem('twl-auth') || 'null');
      return (s && (s.email || s.login_id)) || '';
    } catch (e) { return ''; }
  }

  function bindWatchBtn() {
    var b = el('watchBtn');
    if (!b) return;
    b.addEventListener('click', function () {
      var mbl = b.getAttribute('data-mbl'), carrier = b.getAttribute('data-carrier');
      var mail = myEmail();
      var input = window.prompt('추적 알림을 받을 이메일 주소\n(비우면 등록만 하고 메일은 보내지 않습니다)', mail);
      if (input === null) return;                       /* 취소 */
      b.disabled = true; b.textContent = '등록 중…';
      fetch(WATCH_API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', mbl_no: mbl, carrier: carrier, notify_email: input.trim(), created_by: mail })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.error) { b.disabled = false; b.innerHTML = SVG.bell + ' 추적 등록'; alert('등록 실패: ' + d.error); return; }
        b.innerHTML = SVG.check + ' 등록됨';
        b.classList.add('is-on');
        loadWatchList();
      }).catch(function () {
        b.disabled = false; b.innerHTML = SVG.bell + ' 추적 등록';
        alert('일시적 네트워크 오류입니다 — 잠시 후 다시 시도하십시오.');
      });
    });
  }

  function watchRowHtml(it) {
    var s = it.snapshot || {};
    var ch = it.changes || [];
    var badge = it.active
      ? '<span class="trk-badge is-move">감시 중</span>'
      : '<span class="trk-badge is-done">추적 종료</span>';
    return '<tr>' +
      '<td class="cn">' + SVG.box + ' ' + esc(it.mbl_no) + '</td>' +
      '<td>' + esc(it.carrier || '') + '</td>' +
      '<td>' + badge + '</td>' +
      '<td>' + esc(s.status || it.last_status || '-') + '</td>' +
      '<td>' + esc([s.por, s.pod].filter(Boolean).join(' → ') || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(s.etd) || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(s.eta) || '-') + '</td>' +
      '<td>' + (ch.length
        ? '<span title="' + esc(ch.map(function (c) { return c.field + ': ' + c.old_value + ' → ' + c.new_value; }).join('\n')) +
          '" style="color:var(--up);font-weight:700;">' + ch.length + '건</span>'
        : '<span class="na">-</span>') + '</td>' +
      '<td>' + esc(it.notify_email || '-') + '</td>' +
      '<td class="dt">' + esc(fmtShort(it.last_polled_at) || '-') + '</td>' +
      '<td>' + (it.active
        ? '<button class="btn btn-ghost trk-mini" type="button" data-off="' + esc(it.mbl_no) + '">해제</button>'
        : '') + '</td>' +
      '</tr>';
  }

  function loadWatchList() {
    var box = el('watchOut');
    if (!box) return;
    fetch(WATCH_API + '?action=list').then(function (r) { return r.json(); }).then(function (d) {
      var items = d.items || [];
      if (!items.length) {
        box.innerHTML = '<div class="card"><p class="sc-sub" style="margin:0;">등록된 추적 화물이 없습니다. 위에서 B/L 을 조회한 뒤 <b>추적 등록</b>을 누르면 ' +
          '스케줄러가 매일 08:20 / 20:20 에 조회해 <b>출항·도착 예정일시가 바뀌면 메일로 알려드립니다.</b></p></div>';
        return;
      }
      var act = items.filter(function (x) { return x.active; }).length;
      box.innerHTML = '<div class="card trk-card">' +
        '<div class="trk-head"><span class="trk-bl">추적 등록 화물</span>' +
        '<span class="trk-carrier">감시 중 ' + act + '건 / 전체 ' + items.length + '건</span>' +
        '<span class="trk-spacer"></span>' +
        '<span class="trk-asof">스케줄러 매일 08:20 · 20:20 · ETD/ETA 변경 시 메일 발송</span></div>' +
        '<div class="trk-sec" style="padding-top:14px;"><div class="trk-tbl-wrap"><table class="trk-tbl">' +
        '<thead><tr><th>B/L No.</th><th>선사</th><th>상태</th><th>진행</th><th>구간</th><th>ETD</th><th>ETA</th>' +
        '<th>변경</th><th>알림 수신</th><th>최근 수집</th><th></th></tr></thead><tbody>' +
        items.map(watchRowHtml).join('') + '</tbody></table></div></div></div>';
      box.querySelectorAll('button[data-off]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var mbl = btn.getAttribute('data-off');
          if (!window.confirm(mbl + ' 추적을 해제할까요?\n(기록은 남고 이후 수집·알림만 중단됩니다)')) return;
          btn.disabled = true;
          fetch(WATCH_API, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove', mbl_no: mbl })
          }).then(function () { loadWatchList(); })
            .catch(function () { btn.disabled = false; alert('해제 실패 — 잠시 후 다시 시도하십시오.'); });
        });
      });
    }).catch(function () {
      box.innerHTML = '<div class="card"><p class="sc-sub" style="margin:0;">추적 목록을 불러오지 못했습니다.</p></div>';
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
