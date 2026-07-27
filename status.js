/* =========================================================
   TWL 데이터 현황 — 파이프라인 운영 보드
   (종합 판정 배너 · 흐름도 · 최신성 게이지 · 7일 타임라인)
   ========================================================= */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://kvmyiualdodcvreoqfin.supabase.co';
  var KEY = 'sb_publishable_jo6oBar-JbfKY3IfhPyBbQ_gH1Lvwsv'; /* 읽기 전용(RLS) */
  var lastUpdateTs = null;

  function sb(path) {
    return fetch(SUPABASE_URL + path, { headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtTs(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function ageText(ms) {
    var h = ms / 3600000;
    if (h < 1) return Math.round(h * 60) + '분 전';
    if (h < 48) return Math.round(h) + '시간 전';
    return Math.round(h / 24) + '일 전';
  }
  var ST = {
    ok:   { ko: '정상', color: 'var(--lv-low)' },
    warn: { ko: '주의', color: 'var(--lv-stable)' },
    late: { ko: '지연', color: 'var(--lv-congested)' },
    off:  { ko: '확인불가', color: 'var(--muted)' }
  };

  function srcCard(o) {
    var st = ST[o.state];
    var fill = Math.max(4, Math.min(100, o.freshPct));
    return '<div class="src-card">' +
      '<div class="sc-top"><b>' + o.name + '</b>' +
      '<span class="lv-badge" style="color:' + st.color + '; background:color-mix(in srgb, ' + st.color + ' 13%, transparent);"><i class="lv-dot"></i>' + st.ko + '</span></div>' +
      '<div class="sc-big">' + o.big + '</div>' +
      '<div class="fresh-bar" title="갱신 주기 대비 경과 시간"><div class="fb-fill" style="width:' + fill + '%; background:' + st.color + ';"></div></div>' +
      '<div class="sc-sub">' + o.sub + '</div>' +
      '<div class="sc-next">다음 갱신 예정 · ' + o.next + '</div>' +
      '</div>';
  }

  function pipeNode(label, sub, state) {
    var st = ST[state];
    return '<div class="pipe-node" style="border-color: color-mix(in srgb, ' + st.color + ' 45%, transparent);">' +
      '<span class="pn-dot" style="background:' + st.color + ';"></span>' +
      '<b>' + label + '</b><small>' + sub + '</small></div>';
  }

  function load() {
    var today = dstr(new Date());
    var results = { berth: null, pi: null, fx: null, wx: null, logs: [] };

    var pBerth = sb('/rest/v1/bs_vessel_calls?select=collected_date&order=collected_date.desc&limit=1')
      .then(function (rows) {
        if (!rows.length) return;
        var d = rows[0].collected_date;
        return sb('/rest/v1/bs_vessel_calls?select=id&collected_date=eq.' + d)
          .then(function (all) { results.berth = { date: d, count: all.length }; });
      }).catch(function () {});

    var pPi = sb('/rest/v1/pi_snapshot?select=period_end,updated_at,tpfs&id=eq.1')
      .then(function (rows) { if (rows.length) results.pi = rows[0]; }).catch(function () {});

    var pFx = sb('/rest/v1/freight_index?select=pub_date,value,index_code,route&order=pub_date.desc&limit=20')
      .then(function (rows) {
        var scfi = rows.filter(function (x) { return x.index_code === 'SCFI' && x.route === 'COMPOSITE'; })[0];
        if (rows.length) results.fx = { date: rows[0].pub_date, scfi: scfi ? scfi.value : null };
      }).catch(function () {});

    var pWx = fetch('https://marine-api.open-meteo.com/v1/marine?latitude=35.05&longitude=128.79&current=wave_height&timezone=Asia%2FSeoul')
      .then(function (r) { return r.json(); })
      .then(function (js) { if (js && js.current) results.wx = { wave: js.current.wave_height, time: js.current.time }; })
      .catch(function () {});

    var pLog = sb('/rest/v1/bs_collect_log?select=*&order=created_at.desc&limit=14')
      .then(function (rows) { results.logs = rows; }).catch(function () {});

    Promise.all([pBerth, pPi, pFx, pWx, pLog]).then(function () { render(results, today); });
    lastUpdateTs = Date.now();
    updateStamp();
  }

  function render(r, today) {
    var now = Date.now();

    /* ---- 데이터 소스 최신성 ---- */
    var cards = [];
    var berthState = 'off', berthOnTime = false;
    if (r.berth) {
      berthOnTime = r.berth.date === today;
      var age = now - new Date(r.berth.date + 'T06:00:00+09:00').getTime();
      berthState = berthOnTime ? 'ok' : (age < 30 * 3600000 ? 'warn' : 'late');
      cards.push(srcCard({
        name: '선석배정', state: berthState,
        big: r.berth.count + '건 <small>/ ' + r.berth.date + '</small>',
        freshPct: age / (26 * 3600000) * 100,
        sub: '9개 터미널 · ' + ageText(age) + ' 수집 · 갱신 주기 24시간',
        next: '내일 06:00 수집 → 06시대 적재'
      }));
    } else cards.push(srcCard({ name: '선석배정', state: 'off', big: '—', freshPct: 100, sub: '연결 실패', next: '—' }));

    var piState = 'off';
    if (r.pi) {
      var piAge = now - new Date(r.pi.updated_at).getTime();
      piState = piAge < 26 * 3600000 ? 'ok' : (piAge < 50 * 3600000 ? 'warn' : 'late');
      cards.push(srcCard({
        name: 'Port Insight (TW-PFS)', state: piState,
        big: 'TW-PFS ' + r.pi.tpfs + ' <small>/ 기준일 ' + r.pi.period_end + '</small>',
        freshPct: piAge / (26 * 3600000) * 100,
        sub: '최종 산출 ' + ageText(piAge) + ' · 산출 주기 24시간 (원천 데이터는 주간 갱신)',
        next: '내일 06시대 자동 산출'
      }));
    } else cards.push(srcCard({ name: 'Port Insight', state: 'off', big: '—', freshPct: 100, sub: '연결 실패', next: '—' }));

    if (r.fx) {
      var fxAge = now - new Date(r.fx.date + 'T00:00:00+09:00').getTime();
      var fxState = fxAge < 9 * 86400000 ? 'ok' : 'warn';
      cards.push(srcCard({
        name: '해상운임지수 (SCFI·CCFI)', state: fxState,
        big: (r.fx.scfi != null ? 'SCFI ' + Number(r.fx.scfi).toLocaleString('ko-KR') : '—') + ' <small>/ ' + r.fx.date + ' 발표</small>',
        freshPct: fxAge / (9 * 86400000) * 100,
        sub: ageText(fxAge) + ' 발표분 · 주간 공표 (매주 금요일)',
        next: '월요일 07시 수집'
      }));
    } else cards.push(srcCard({ name: '해상운임지수', state: 'off', big: '—', freshPct: 100, sub: '데이터 없음', next: '월요일 07시' }));

    if (r.wx) {
      cards.push(srcCard({
        name: '항만 기상 (Open-Meteo)', state: 'ok',
        big: '부산신항 파고 ' + r.wx.wave + 'm',
        freshPct: 8,
        sub: '실시간 조회 정상 · 관측 주기 1시간',
        next: '상시 (30분 간격 갱신)'
      }));
    } else cards.push(srcCard({ name: '항만 기상', state: 'off', big: '—', freshPct: 100, sub: 'API 응답 없음', next: '상시' }));
    el('srcGrid').innerHTML = cards.join('');

    /* ---- 종합 판정 배너 ---- */
    var states = [berthState, piState];
    var overall = states.indexOf('late') >= 0 || states.indexOf('off') >= 0 ? 'late'
      : (states.indexOf('warn') >= 0 ? 'warn' : 'ok');
    var hb = el('healthBanner');
    hb.className = 'health-banner hb-' + overall;
    el('hbTitle').textContent = overall === 'ok' ? '모든 파이프라인 정상'
      : overall === 'warn' ? '일부 파이프라인 확인 필요' : '파이프라인 점검 필요';
    el('hbSub').textContent = overall === 'ok'
      ? '— 선석배정 금일분 적재 완료, Port Insight 24시간 내 산출'
      : '— 아래 최신성 카드에서 주의/지연 항목을 확인하십시오';

    /* ---- 파이프라인 흐름도 ---- */
    var okAll = berthOnTime;
    el('pipeFlow').innerHTML =
      pipeNode('① 터미널 수집', '9곳 · 06:00', okAll ? 'ok' : 'warn') +
      '<span class="pipe-arrow">→</span>' +
      pipeNode('② 정규화·적재', '06시대 자동', okAll ? 'ok' : 'warn') +
      '<span class="pipe-arrow">→</span>' +
      pipeNode('③ DB 저장', r.berth ? r.berth.count + '건' : '—', r.berth ? 'ok' : 'off') +
      '<span class="pipe-arrow">→</span>' +
      pipeNode('④ 대시보드', '45초 폴링', r.berth ? 'ok' : 'off');

    /* ---- 최근 7일 타임라인 ---- */
    var byDate = {};
    (r.logs || []).forEach(function (l) {
      var cur = byDate[l.collected_date];
      if (!cur || l.status === 'SUCCESS') byDate[l.collected_date] = l;
    });
    var chips = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date(now - i * 86400000);
      var ds = dstr(d);
      var log = byDate[ds];
      var cls = log ? (log.status === 'SUCCESS' ? 'dg-ok' : 'dg-fail') : 'dg-none';
      var mark = log ? (log.status === 'SUCCESS' ? '✓ ' + log.total_rows + '건' : '✗ 실패') : '· 없음';
      chips.push('<div class="day-chip ' + cls + '"><small>' + ds.slice(5) + (i === 0 ? ' (오늘)' : '') + '</small><b>' + mark + '</b></div>');
    }
    el('dayGrid').innerHTML = chips.join('');

    /* ---- 이력 테이블 ---- */
    el('logBody').innerHTML = (r.logs || []).map(function (l) {
      var ok = l.status === 'SUCCESS';
      return '<tr><td>' + esc(l.collected_date) + '</td>' +
        '<td style="max-width:280px; overflow:hidden; text-overflow:ellipsis;">' + esc(l.file_name || '—') + '</td>' +
        '<td class="num">' + (l.total_rows || 0) + '</td>' +
        '<td><span class="lv-badge ' + (ok ? 'lv-low' : 'lv-congested') + '"><i class="lv-dot"></i>' + (ok ? 'SUCCESS' : 'FAIL') + '</span></td>' +
        '<td style="color:var(--muted); font-size:12px;">' + esc(l.message || '') + '</td>' +
        '<td>' + fmtTs(l.created_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:22px;">적재 이력이 없습니다.</td></tr>';
  }

  function updateStamp() {
    if (!lastUpdateTs) return;
    var sec = Math.max(0, Math.round((Date.now() - lastUpdateTs) / 1000));
    el('lastUpdated').textContent = sec < 5 ? '방금 업데이트' : sec + '초 전 업데이트';
  }

  document.addEventListener('DOMContentLoaded', function () {
    load();
    el('refreshBtn').addEventListener('click', function () {
      this.classList.add('spin');
      var b = this; setTimeout(function () { b.classList.remove('spin'); }, 600);
      load();
    });
    setInterval(load, 45000);
    setInterval(updateStamp, 5000);
  });
})();
