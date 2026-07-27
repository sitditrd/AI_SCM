/* =========================================================
   TWL Berth Insight — 선석배정현황 렌더러
   (45초 자동 갱신 · 항만/터미널/상태 필터 · 검색 · 마감 임박 강조)
   ========================================================= */
(function () {
  'use strict';

  var UI = null, B = null;
  var lastUpdateTs = null;
  var CCT_SOON_MS = 12 * 3600 * 1000;   /* 반입마감 임박 기준 12시간 (PRD FR-07) */

  /* ---------- ETA 지연 리스크 모델 (몬테카를로) ----------
     실측 접안편차(실제 작업시작 - 접안예정, 시간)로 터미널별 로그정규 분포 적합.
     표본 3건 미만 터미널은 기본 분포(중앙값 2h) 사용 — 이력 축적 시 자동 보정. */
  var SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var SB_KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv';
  var delayModel = { def: { mu: Math.log(2), sigma: 0.9, n: 0 }, byTerm: {} };

  function randn() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function calibrateDelayModel() {
    return fetch(SUPABASE_URL + '/rest/v1/bs_vessel_calls?select=terminal_cd,eta,work_start' +
      '&work_start=not.is.null&eta=not.is.null&order=collected_date.desc&limit=800',
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var byTerm = {};
        rows.forEach(function (r) {
          var d = (new Date(r.work_start) - new Date(r.eta)) / 3600000;
          if (!isFinite(d)) return;
          d = Math.max(0.1, Math.min(72, d));            /* 조기접안은 0.1h로 절단 */
          (byTerm[r.terminal_cd] = byTerm[r.terminal_cd] || []).push(Math.log(d));
        });
        Object.keys(byTerm).forEach(function (t) {
          var a = byTerm[t];
          if (a.length < 3) return;
          var mu = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
          var va = a.reduce(function (x, y) { return x + (y - mu) * (y - mu); }, 0) / a.length;
          delayModel.byTerm[t] = { mu: mu, sigma: Math.max(0.35, Math.sqrt(va)), n: a.length };
        });
      }).catch(function () { /* 보정 실패 시 기본 분포 유지 */ });
  }
  function termRisk(t) {
    var m = delayModel.byTerm[t] || delayModel.def;
    var late = 0, sum = 0, N = 4000;
    for (var i = 0; i < N; i++) {
      var d = Math.exp(m.mu + m.sigma * randn());
      sum += d;
      if (d > 6) late++;
    }
    return { p6: Math.round(late / N * 100), meanH: sum / N, n: m.n };
  }

  var STATUS_ORDER = ['PLANNED', 'ARRIVED', 'WORKING', 'DEPARTED'];
  var STATUS_COLOR = { PLANNED: '#2a78d6', ARRIVED: '#fab219', WORKING: '#0ca30c', DEPARTED: '#8493ac' };

  var filter = {
    port: 'ALL',
    terminal: 'ALL',
    status: { PLANNED: true, ARRIVED: true, WORKING: true, DEPARTED: true },
    q: ''
  };

  document.addEventListener('DOMContentLoaded', function () {
    UI = window.TWUI; B = window.TWBERTH;
    if (!B) return;

    B.init().then(function () {
      calibrateDelayModel().then(function () { renderTerminalSummary(); });
      renderAll(true);
      initPortChips();
      initStatusChips();
      initSearch();
      initStampTicker();
      updateSourceBadge();

      document.getElementById('refreshBtn').addEventListener('click', function () {
        var btn = this;
        btn.classList.add('spin');
        setTimeout(function () { btn.classList.remove('spin'); }, 600);
        poll();
      });
      setInterval(poll, 45000);
    });
  });

  function poll() {
    if (B.getMode() === 'supabase') {
      B.refreshLive().then(function () {
        renderAll(false);
        el('staleBanner').classList.remove('show');
      }).catch(function () {
        el('staleBanner').classList.add('show');
        updateStamp();
      });
    } else {
      /* 오프라인: 재연결 시도 — 성공 시에만 화면 갱신 */
      B.init().then(function (ok) {
        if (ok) {
          updateSourceBadge();
          renderAll(false);
          el('staleBanner').classList.remove('show');
        }
      });
    }
  }

  /* ================= 헬퍼 ================= */
  function el(id) { return document.getElementById(id); }
  function fmt(n) { return UI.fmt(n, 0); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function stBadge(st) {
    return '<span class="st-badge st-' + st.toLowerCase() + '"><i class="lv-dot"></i>' +
      st + ' · ' + (B.STATUS_KO[st] || st) + '</span>';
  }

  function updateSourceBadge() {
    var host = document.querySelector('.live-status');
    if (!host) return;
    var b = el('srcBadge');
    if (!b) {
      b = document.createElement('span');
      b.id = 'srcBadge';
      b.className = 'src-badge';
      host.insertBefore(b, host.firstChild);
    }
    if (B.getMode() === 'supabase') {
      b.textContent = 'Supabase 실데이터';
      b.classList.add('live');
      b.title = '데이터 소스: Supabase (bs_vessel_calls)';
    } else {
      b.textContent = '내장 시드';
      b.classList.remove('live');
      var err = B.getLastError();
      b.title = '데이터 소스: 내장 시드 (' + B.getCollectedDate() + ' 수집분)' + (err ? ' — ' + err.message : '');
    }
  }

  /* ================= 필터 UI ================= */
  function initPortChips() {
    var rows = B.getRows();
    var wrap = el('portChips');
    var items = ['ALL'].concat(B.PORTS);
    wrap.innerHTML = items.map(function (p) {
      var cnt = p === 'ALL' ? rows.length : rows.filter(function (r) { return r.port === p; }).length;
      return '<button class="f-chip' + (filter.port === p ? '' : ' off') + '" data-port="' + p + '">' +
        (p === 'ALL' ? '전체 항만' : p) + ' (' + cnt + ')</button>';
    }).join('');
    wrap.querySelectorAll('.f-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        filter.port = c.getAttribute('data-port');
        filter.terminal = 'ALL';
        initPortChips();
        renderTerminalTabs();
        renderTable();
      });
    });
    renderTerminalTabs();
  }

  function renderTerminalTabs() {
    var rows = B.getRows();
    var wrap = el('terminalTabs');
    var codes = Object.keys(B.TERMINALS).filter(function (c) {
      return filter.port === 'ALL' || B.TERMINALS[c].port === filter.port;
    }).sort(function (a, b) { return B.TERMINALS[a].ord - B.TERMINALS[b].ord; });
    var html = '<button class="tab-btn' + (filter.terminal === 'ALL' ? ' active' : '') + '" data-term="ALL">전체 터미널</button>';
    html += codes.map(function (c) {
      var cnt = rows.filter(function (r) { return r.t === c; }).length;
      return '<button class="tab-btn' + (filter.terminal === c ? ' active' : '') + '" data-term="' + c + '">' +
        c + ' (' + cnt + ')</button>';
    }).join('');
    wrap.innerHTML = html;
    wrap.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        filter.terminal = b.getAttribute('data-term');
        wrap.querySelectorAll('.tab-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        renderTable();
      });
    });
  }

  function initStatusChips() {
    var rows = B.getRows();
    var wrap = el('statusChips');
    wrap.innerHTML = STATUS_ORDER.map(function (st) {
      var on = filter.status[st];
      var cnt = rows.filter(function (r) { return r.status === st; }).length;
      return '<button class="f-chip' + (on ? '' : ' off') + '" data-st="' + st + '" aria-pressed="' + on + '">' +
        '<span class="sw" style="background:' + STATUS_COLOR[st] + ';"></span>' +
        B.STATUS_KO[st] + ' (' + cnt + ')' +
        '<span class="x">' + (on ? '×' : '+') + '</span></button>';
    }).join('');
    wrap.querySelectorAll('.f-chip').forEach(function (c) {
      c.addEventListener('click', function () {
        var st = c.getAttribute('data-st');
        filter.status[st] = !filter.status[st];
        initStatusChips();
        renderTable();
      });
    });
  }

  function initSearch() {
    el('berthSearch').addEventListener('input', function () {
      filter.q = this.value.trim().toLowerCase();
      renderTable();
    });
  }

  /* ================= 렌더 ================= */
  function renderAll(first) {
    if (B.getMode() === 'supabase') lastUpdateTs = Date.now();
    renderMeta();
    if (!first) { initPortChips(); initStatusChips(); }
    renderKpis(first);
    renderTable();
    renderTerminalSummary();
    /* 대형 표는 등장 애니메이션 관찰 조건과 무관하게 즉시 표시 (진입 시 빈 화면 방지) */
    document.querySelectorAll('#list .reveal, #byterminal .reveal').forEach(function (n) { n.classList.add('in'); });
    updateStamp();
  }

  function renderMeta() {
    el('collectLabel').textContent = B.getCollectedDate();
    el('totalLabel').textContent = fmt(B.getRows().length);
  }

  function renderKpis(first) {
    var rows = B.getRows();
    var ref = B.getRefMs();
    var total = rows.length;
    var working = rows.filter(function (r) { return r.status === 'ARRIVED' || r.status === 'WORKING'; }).length;
    var cctSoon = rows.filter(function (r) {
      return r.status !== 'DEPARTED' && r.cct != null && r.cct >= ref && r.cct <= ref + CCT_SOON_MS;
    }).length;
    var dayEnd = ref + 18 * 3600 * 1000;  /* 06:00 + 18h = 수집일 자정 */
    var etdToday = rows.filter(function (r) {
      return r.status !== 'DEPARTED' && r.etd != null && r.etd >= ref && r.etd <= dayEnd;
    }).length;

    setKpi('kTotal', total, first);
    setKpi('kWorking', working, first);
    setKpi('kCct', cctSoon, first);
    setKpi('kEtd', etdToday, first);
    el('kTotalSub').textContent = '부산신항·광양항·인천항 9개 터미널';
  }
  function setKpi(id, v, first) {
    var e = el(id);
    if (first) UI.countUp(e, v, { dec: 0 });
    else e.textContent = fmt(v);
  }

  function pass(r) {
    if (filter.port !== 'ALL' && r.port !== filter.port) return false;
    if (filter.terminal !== 'ALL' && r.t !== filter.terminal) return false;
    if (filter.status[r.status] === false) return false;
    if (filter.q) {
      var hay = (r.vessel + ' ' + r.carrier + ' ' + r.route + ' ' + r.voy + ' ' + r.t + ' ' + (r.sub || '')).toLowerCase();
      if (hay.indexOf(filter.q) < 0) return false;
    }
    return true;
  }

  function renderTable() {
    var ref = B.getRefMs();
    var rows = B.getRows().filter(pass).sort(function (a, b) {
      return (a.eta == null ? Infinity : a.eta) - (b.eta == null ? Infinity : b.eta);
    });
    el('matchLabel').textContent = fmt(rows.length) + '건 표시';
    el('berthBody').innerHTML = rows.map(function (r) {
      var soon = r.status !== 'DEPARTED' && r.cct != null && r.cct >= ref && r.cct <= ref + CCT_SOON_MS;
      var past = r.cct != null && r.cct < ref;
      var cctCell = r.cct == null ? '—'
        : '<span class="' + (soon ? 'cct-soon-txt' : (past ? 'cct-past' : '')) + '">' + B.fmtDT(r.cct) + (soon ? ' ⚠' : '') + '</span>';
      var termCell = '<div class="port-cell"><b>' + esc(r.t) + (r.sub ? ' · ' + esc(r.sub) : '') + '</b><small>' + esc(r.terminalName) + '</small></div>';
      var vesselCell = '<div class="port-cell"><b>' + esc(r.vessel) + '</b><small>' + esc(r.voy) + '</small></div>';
      return '<tr class="' + (soon ? 'row-cct-soon' : '') + (r.status === 'DEPARTED' ? ' row-departed' : '') + '">' +
        '<td>' + termCell + '</td>' +
        '<td>' + esc(r.berth) + '</td>' +
        '<td>' + vesselCell + '</td>' +
        '<td>' + esc(r.carrier) + '</td>' +
        '<td>' + esc(r.route) + '</td>' +
        '<td>' + cctCell + '</td>' +
        '<td>' + B.fmtDT(r.eta) + '</td>' +
        '<td>' + B.fmtDT(r.etd) + '</td>' +
        '<td class="num">' + fmt(r.dis) + '</td>' +
        '<td class="num">' + fmt(r.lod) + '</td>' +
        '<td>' + stBadge(r.status) + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="11" style="text-align:center; color:var(--muted); padding:26px;">조건에 맞는 선석배정이 없습니다.</td></tr>';
  }

  function renderTerminalSummary() {
    var rows = B.getRows();
    var codes = Object.keys(B.TERMINALS).sort(function (a, b) { return B.TERMINALS[a].ord - B.TERMINALS[b].ord; });
    el('termBody').innerHTML = codes.map(function (c) {
      var list = rows.filter(function (r) { return r.t === c; });
      var work = list.filter(function (r) { return r.status === 'ARRIVED' || r.status === 'WORKING'; }).length;
      var dis = list.reduce(function (s, r) { return s + r.dis; }, 0);
      var lod = list.reduce(function (s, r) { return s + r.lod; }, 0);
      var sh = list.reduce(function (s, r) { return s + r.shift; }, 0);
      var rk = termRisk(c);
      var rkColor = rk.p6 >= 40 ? 'var(--lv-congested)' : (rk.p6 >= 20 ? 'var(--lv-busy)' : 'var(--lv-low)');
      var rkCell = rk.n >= 3
        ? '<span style="color:' + rkColor + '; font-weight:800;">' + rk.p6 + '%</span> <small style="color:var(--muted);">(표본 ' + rk.n + ')</small>'
        : '<span style="color:var(--muted);">' + rk.p6 + '%</span> <small style="color:var(--muted);">기본모델</small>';
      return '<tr>' +
        '<td><div class="port-cell"><b>' + c + '</b><small>' + esc(B.TERMINALS[c].name) + '</small></div></td>' +
        '<td>' + esc(B.TERMINALS[c].port) + '</td>' +
        '<td class="num">' + fmt(list.length) + '</td>' +
        '<td class="num">' + fmt(work) + '</td>' +
        '<td class="num">' + fmt(dis) + '</td>' +
        '<td class="num">' + fmt(lod) + '</td>' +
        '<td class="num">' + fmt(sh) + '</td>' +
        '<td class="num">' + rkCell + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ================= 스탬프 ================= */
  function updateStamp() {
    var e = el('lastUpdated');
    if (!e) return;
    if (B.getMode() !== 'supabase') {
      e.textContent = B.getCollectedDate() + ' 수집분 표시 중 (오프라인)';
      el('staleBanner').classList.add('show');
      return;
    }
    if (!lastUpdateTs) return;
    var sec = Math.max(0, Math.round((Date.now() - lastUpdateTs) / 1000));
    e.textContent = sec < 5 ? '방금 업데이트' : sec + '초 전 업데이트';
  }
  function initStampTicker() { setInterval(updateStamp, 5000); }
})();
