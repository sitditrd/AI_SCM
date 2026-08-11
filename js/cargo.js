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
  /* carrier-track 이 실조회를 지원하는 선사 (그 외는 딥링크 폴백) */
  var LIVE_SCACS = { ONEY: 1, COSU: 1 };

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
    SMLM: ['SM상선', 'https://esvc.smlines.com/smline/CUP_HOM_3301.do']
  };
  function oceanInfo(no) {
    /* 프리픽스 4글자 + 영숫자 6자 이상 — 숫자만 강제하면 ONE 처럼 부킹오피스 문자가
       섞이는 BL(예: ONEYRICG34548800)을 놓친다(2026-08-11 실측). 오탐은 OCEAN 맵 조회가 걸러낸다. */
    var m = /^([A-Za-z]{4})[A-Za-z0-9]{6,}$/.exec(String(no).replace(/[^A-Za-z0-9]/g, ''));
    if (!m) return null;
    var scac = m[1].toUpperCase();
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

  /* ---- 선사 운송 추적 (carrier-track) ---- */
  function fmtIso(v) {
    /* 항만 현지시각 ISO 문자열 — new Date() 로 브라우저 TZ 변환하지 않고 문자열 그대로 자른다 */
    var s = String(v || '');
    return s.length >= 16 ? s.slice(0, 16).replace('T', ' ') : s;
  }
  function evBadge(actual) {
    return actual
      ? '<span style="font-size:10px; padding:1px 6px; border-radius:8px; background:var(--brand-accent-2); color:#fff;">실제</span>'
      : '<span style="font-size:10px; padding:1px 6px; border-radius:8px; border:1px solid var(--muted); color:var(--muted);">예정</span>';
  }
  function renderCarrier(res, no) {
    var out = el('carrierOut');
    if (!res || res.error) {
      out.innerHTML = '<div class="card reveal in" style="margin-bottom:14px;"><b>선사 운송 추적</b>' +
        '<p class="sc-sub">' + esc(res && res.error || '조회 실패') + '</p>' +
        (function () { var oc = oceanInfo(no); return oc && oc.url ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + oc.url + '">' + esc(oc.name) + ' 트래킹 ↗</a>' : ''; })() +
        '</div>';
      return;
    }
    var s = res.summary || {};
    var html = '<div class="card reveal in" style="margin-bottom:14px;">' +
      '<h3 style="margin-top:0;">선사 운송 추적 <small style="color:var(--muted);">' + esc(res.carrierName || res.carrier) + ' · ' + esc((res.query || {}).no || no) + '</small></h3>';
    if (s.por || s.pod) {
      html += '<p class="sc-sub" style="margin:4px 0 10px;">' + esc(s.por || '?') + ' → ' + esc(s.pod || '?') +
        (s.bookingNo ? ' · <span style="color:var(--muted);">Booking ' + esc(s.bookingNo) + '</span>' : '') + '</p>';
    }
    /* 운송 구간(항차) — 레거시 FMS_API_TS 상당, N구간 */
    if (res.voyages && res.voyages.length) {
      html += '<div class="tbl-scroll"><table class="tw"><thead><tr><th>선박 / 항차</th><th>선적항</th><th>양륙항</th></tr></thead><tbody>' +
        res.voyages.map(function (v) {
          return '<tr><td>' + esc(v.vessel || '') + ' <span style="color:var(--muted);">' + esc(v.voyage || '') + '</span></td>' +
            '<td>' + esc(v.pol && v.pol.name || '') + '<br><small>' + evBadge(v.pol && v.pol.actual) + ' ' + esc(fmtIso(v.pol && v.pol.date)) + '</small></td>' +
            '<td>' + esc(v.pod && v.pod.name || '') + '<br><small>' + evBadge(v.pod && v.pod.actual) + ' ' + esc(fmtIso(v.pod && v.pod.date)) + '</small></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    /* 컨테이너별 이벤트 타임라인 — 레거시 FMS_API_CNTR 상당 */
    (res.containers || []).forEach(function (c) {
      html += '<h3 style="font-size:15px; margin-bottom:6px;">컨테이너 <span>' + esc(c.cntrNo || '') + '</span>' +
        (c.szTp ? ' <small style="color:var(--muted); font-weight:400;">' + esc(c.szTp) + '</small>' : '') + '</h3>';
      var evs = c.events || [];
      if (evs.length) {
        html += '<div class="pipe-flow" style="flex-direction:column; gap:8px;">' + evs.map(function (e) {
          var t = e.timeLocal || e.timeUtc;
          return '<div class="pipe-node" style="flex:none;"><span class="pn-dot" style="background:' + (e.actual ? 'var(--brand-accent-2)' : 'var(--muted)') + ';"></span>' +
            '<b>' + esc(e.name || '') + '</b> ' + evBadge(e.actual) +
            '<small>' + esc(e.location || '') + (e.yard ? ' · ' + esc(e.yard) : '') + (t ? ' · ' + esc(fmtIso(t)) + ' <span style="color:var(--muted);">(현지)</span>' : '') + '</small></div>';
        }).join('') + '</div>';
      } else {
        html += '<p class="sc-sub">이벤트 정보가 없습니다.</p>';
      }
    });
    if (!(res.voyages || []).length && !(res.containers || []).length) {
      html += '<p class="sc-sub">운송 정보가 없습니다.</p>';
    }
    html += '<p class="sc-sub" style="margin-top:10px; font-size:11px; color:var(--muted);">데이터 시점 ' + esc(fmtIso(res.fetchedAt)) + ' UTC · 출처 ' + esc(res.source || '') + ' · 시각은 항만 현지 기준</p></div>';
    out.innerHTML = html;
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
  });
})();
