/* =========================================================
   TWL 화물 추적 — 유니패스 통관진행 + AWB 항공사 딥링크
   로컬(localhost)은 server.py /api/track, 배포판은 Supabase Edge Function `track` 호출
   ========================================================= */
(function () {
  'use strict';

  var TRACK_API = (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))
    ? '/api/track'
    : 'https://kvmyiualdodcvreoqfin.supabase.co/functions/v1/track';

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
  /* 해상 MBL 프리픽스(SCAC) → 선사 트래킹 딥링크 (컨테이너 리스트·ETD/ETA/ATD/ATA는 선사 화면 제공) */
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
    var m = /^([A-Za-z]{4})[0-9]{6,}$/.exec(String(no).replace(/[^A-Za-z0-9]/g, ''));
    if (!m) return null;
    var scac = m[1].toUpperCase();
    var c = OCEAN[scac];
    return { scac: scac, name: c ? c[0] : null, url: c ? (c[1].indexOf('=') > 0 || /\/$/.test(c[1]) ? c[1] + encodeURIComponent(no) : c[1]) : null };
  }

  var type = 'mbl';

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

  function flatten(o, out, depth) {
    /* 유니패스 응답에서 이력형 리스트/필드를 관대하게 추출 */
    out = out || { fields: {}, lists: [] };
    depth = depth || 0;
    if (depth > 5 || o == null) return out;
    if (Array.isArray(o)) { out.lists.push(o); return out; }
    if (typeof o === 'object') {
      Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (Array.isArray(v) && v.length && typeof v[0] === 'object') out.lists.push(v);
        else if (typeof v === 'object') flatten(v, out, depth + 1);
        else if (v !== '' && v != null) out.fields[k] = v;
      });
    }
    return out;
  }

  var LABEL = {
    prgsStts: '진행상태', prgsStcd: '진행상태코드', shipNam: '선박명', shipNm: '선박명',
    entsConm: '운송사', prcsDttm: '처리시각', cargTrcnRelaBsopTpcd: '처리구분',
    mblNo: 'MBL', hblNo: 'HBL', blPt: 'B/L구분', ldprNm: '선적항', dsprNm: '양륙항',
    pckGcnt: '포장수량', ttwg: '총중량', csclPrgsStts: '통관진행상태', shedNm: '장치장'
  };
  function lb(k) { return LABEL[k] || k; }
  function fmtDttm(v) {
    var s = String(v).replace(/[^0-9]/g, '');
    if (s.length >= 12) return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + ' ' + s.slice(8, 10) + ':' + s.slice(10, 12);
    return v;
  }

  function render(res, no) {
    var out = el('traceOut');
    if (res.needKey) {
      var awb = awbInfo(no);
      out.innerHTML = '<div class="card reveal in"><h3 style="margin-top:0;">유니패스 API 키가 아직 설정되지 않았습니다</h3>' +
        '<p class="sc-sub">' + esc(res.guide) + '</p>' +
        '<p class="sc-sub" style="color:var(--muted);">키 설정 전에도 아래 외부 조회는 바로 이용할 수 있습니다.</p>' +
        '<div style="display:flex; gap:8px; flex-wrap:wrap;">' +
        '<a class="btn btn-primary" target="_blank" rel="noopener" href="https://unipass.customs.go.kr/csp/index.do">유니패스에서 직접 조회 ↗</a>' +
        (awb && awb.url ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + awb.url + '">' + esc(awb.name) + ' AWB 추적 ↗</a>' : '') +
        (function () { var oc2 = oceanInfo(no); return oc2 && oc2.url ? '<a class="btn btn-ghost" target="_blank" rel="noopener" href="' + oc2.url + '">' + esc(oc2.name) + ' 선사 트래킹 ↗</a>' : ''; })() +
        '</div></div>';
      return;
    }
    if (res.error) {
      out.innerHTML = '<div class="card reveal in"><b>조회 결과 없음 / 오류</b><p class="sc-sub">' + esc(res.error) + '</p></div>';
      return;
    }
    var f = flatten(res.data);
    var keys = Object.keys(f.fields).filter(function (k) { return !/^(tCnt|通|api|crky)/i.test(k); }).slice(0, 14);
    var html = '<div class="card reveal in"><h3 style="margin-top:0;">조회 결과 <small style="color:var(--muted);">' + esc(res.query.type.toUpperCase()) + ' ' + esc(res.query.no) + '</small></h3>';
    if (keys.length) {
      html += '<div class="tbl-scroll"><table class="tw"><tbody>' + keys.map(function (k) {
        return '<tr><td style="width:180px; color:var(--muted);">' + esc(lb(k)) + '</td><td>' + esc(f.fields[k]) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    }
    /* 진행 이력 타임라인 */
    var hist = null;
    f.lists.forEach(function (l) { if (!hist && l[0] && (l[0].prcsDttm || l[0].cargTrcnRelaBsopTpcd)) hist = l; });
    if (hist) {
      html += '<h3 style="font-size:15px;">통관 진행 이력</h3><div class="pipe-flow" style="flex-direction:column; gap:8px;">' +
        hist.map(function (h) {
          return '<div class="pipe-node" style="flex:none;"><span class="pn-dot" style="background:var(--brand-accent-2);"></span>' +
            '<b>' + esc(h.cargTrcnRelaBsopTpcd || h.prgsStts || '처리') + '</b>' +
            '<small>' + esc(fmtDttm(h.prcsDttm || '')) + (h.shedNm ? ' · ' + esc(h.shedNm) : '') + '</small></div>';
        }).join('') + '</div>';
    } else if (!keys.length) {
      html += '<p class="sc-sub">해당 번호의 진행 정보가 없습니다. 연도(선택)와 번호를 확인하십시오.</p>';
    }
    html += '</div>';
    out.innerHTML = html;
  }

  function trace() {
    var no = el('blNo').value.trim();
    if (no.length < 6) return;
    var awb = awbInfo(no);
    var oc = oceanInfo(no);
    el('awbHint').innerHTML = awb
      ? ('AWB 감지 (프리픽스 ' + awb.prefix + (awb.name ? ' · ' + esc(awb.name) : '') + ') — 항공 수입은 MBL 탭으로 조회됩니다.' +
         (awb.url ? ' <a target="_blank" rel="noopener" href="' + awb.url + '">항공사 추적 페이지 ↗</a>' : ''))
      : (oc && oc.name
        ? ('해상 선사 감지 (' + oc.scac + ' · ' + esc(oc.name) + ') — 컨테이너 리스트·ETD/ETA/ATD/ATA는 선사 트래킹에서 확인. ' +
           '<a target="_blank" rel="noopener" href="' + oc.url + '">' + esc(oc.name) + ' 트래킹 ↗</a>')
        : '');
    el('traceOut').innerHTML = '<div class="card reveal in"><div class="sc-sub">관세청 유니패스 조회 중…</div></div>';
    fetch(TRACK_API + '?type=' + type + '&no=' + encodeURIComponent(no) + '&year=' + el('blYear').value)
      .then(function (r) { return r.json(); })
      .then(function (res) { render(res, no); })
      .catch(function () {
        var hint = (TRACK_API.indexOf('functions') >= 0)
          ? '일시적 네트워크 오류입니다 — 잠시 후 다시 시도하십시오.'
          : '백엔드 없는 서버가 응답했습니다 — 기존 서버 창을 모두 닫고 start_server.bat(server.py)로 다시 실행하십시오.';
        el('traceOut').innerHTML = '<div class="card reveal in"><b>백엔드 연결 실패</b><p class="sc-sub">' + hint + '</p></div>';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#typeChips .f-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        type = c.getAttribute('data-t');
        document.querySelectorAll('#typeChips .f-chip').forEach(function (x) { x.classList.add('off'); });
        c.classList.remove('off');
      });
    });
    el('traceBtn').addEventListener('click', trace);
    el('blNo').addEventListener('keydown', function (e) { if (e.key === 'Enter') trace(); });
  });
})();
