/* =========================================================
   TWL SmartBPO — 공통 스크립트 (테마/헤더/리빌/카운트업/툴팁)
   ========================================================= */
(function () {
  'use strict';

  /* ---------- 로고 (공식 CI 심볼 재채색 + 사이트 타이포그래피) ----------
     심볼: twl_symbol.png (공식 심볼을 브랜드 블루/틸로 재채색)
     텍스트: Taewoong Logistics — 페이지 폰트(Pretendard)로 렌더, 테마 자동 대응 */
  var LOGO_HTML =
    '<img class="logo-sym" src="assets/twl_symbol.png" alt="">' +
    '<span class="logo-text" aria-label="Taewoong Logistics">' +
    '<span class="l1"><b>TAEWOONG</b> LOGISTICS</span>' +
    '<span class="l2">TWL SMARTBPO</span>' +
    '</span>';

  function injectLogos() {
    document.querySelectorAll('.logo-slot').forEach(function (el) {
      el.innerHTML = LOGO_HTML;
    });
  }

  /* ---------- 테마 (기본 다크, 토글 유지) ---------- */
  function getSavedTheme() {
    try { return localStorage.getItem('twl-theme'); } catch (e) { return null; }
  }
  function saveTheme(t) {
    try { localStorage.setItem('twl-theme', t); } catch (e) { /* 무시 */ }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-label', t === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
      btn.innerHTML = t === 'dark' ? ICON_SUN : ICON_MOON;
    });
    window.dispatchEvent(new CustomEvent('twl-theme', { detail: t }));
  }
  var ICON_SUN =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';
  var ICON_MOON =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>';

  function initTheme() {
    var t = getSavedTheme() || 'dark';
    applyTheme(t);
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        saveTheme(cur); applyTheme(cur);
      });
    });
  }

  /* ---------- 헤더 스크롤 ---------- */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle('scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var burger = document.querySelector('.nav-burger');
    var nav = document.querySelector('.site-nav');
    if (burger && nav) {
      burger.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      nav.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('open'); });
      });
    }
  }

  /* ---------- 스크롤 리빌 ---------- */
  function initReveal() {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var items = document.querySelectorAll('.reveal');
    if (reduced || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.01 }); /* 임계값을 낮게: 세로로 매우 긴 요소(대형 표)도 일부만 보이면 등장 */
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- 카운트업 ---------- */
  function countUp(el, to, opts) {
    opts = opts || {};
    var dur = opts.dur || 900;
    var dec = opts.dec != null ? opts.dec : (to % 1 !== 0 ? 1 : 0);
    var suffix = opts.suffix || '';
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { el.textContent = fmt(to, dec) + suffix; return; }
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(to * eased, dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function fmt(n, dec) {
    return Number(n).toLocaleString('ko-KR', {
      minimumFractionDigits: dec, maximumFractionDigits: dec
    });
  }

  /* ---------- 공용 툴팁 ---------- */
  var tipEl = null;
  function ensureTip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'tw-tooltip';
      tipEl.setAttribute('role', 'tooltip');
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }
  function bindTooltips(root) {
    (root || document).querySelectorAll('[data-tip]').forEach(function (el) {
      el.addEventListener('mouseenter', function (e) {
        var t = ensureTip();
        t.innerHTML = el.getAttribute('data-tip');
        t.classList.add('show');
      });
      el.addEventListener('mousemove', function (e) {
        var t = ensureTip();
        var x = e.clientX + 14, y = e.clientY + 16;
        var r = t.getBoundingClientRect();
        if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 12;
        if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 12;
        t.style.left = x + 'px'; t.style.top = y + 'px';
      });
      el.addEventListener('mouseleave', function () {
        if (tipEl) tipEl.classList.remove('show');
      });
    });
  }

  /* ---------- 레벨 뱃지 헬퍼 (색+텍스트 병기: 접근성) ---------- */
  var LEVEL_KO = { LOW: '원활', STABLE: '안정', BUSY: '주의', CONGESTED: '혼잡' };
  function levelBadge(level) {
    return '<span class="lv-badge lv-' + level.toLowerCase() + '"><i class="lv-dot"></i>' +
      level + ' · ' + LEVEL_KO[level] + '</span>';
  }
  function levelBadgeShort(level) {
    return '<span class="lv-badge lv-' + level.toLowerCase() + '"><i class="lv-dot"></i>' + level + '</span>';
  }

  /* ---------- 초기화 ---------- */
  /* 스탯 데크 커서 스포트라이트 */
  function initSpotlight() {
    document.querySelectorAll('.live-strip').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initSpotlight();
    injectLogos();
    initTheme();
    initHeader();
    initReveal();
    bindTooltips(document);
    var y = document.querySelector('.footer-year');
    if (y) y.textContent = new Date().getFullYear();
  });

  window.TWUI = {
    countUp: countUp,
    fmt: fmt,
    bindTooltips: bindTooltips,
    levelBadge: levelBadge,
    levelBadgeShort: levelBadgeShort,
    LEVEL_KO: LEVEL_KO,
    initReveal: initReveal
  };
})();
