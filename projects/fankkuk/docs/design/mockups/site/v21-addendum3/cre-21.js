/* 팬꾹 v21 시안용 최소 동작 — 색 고르기·글자수·스위치·"해야 할 일 없을 때" 보기 전환. 서비스 로직 아님. */
(function () {
  var root = document.documentElement;
  function syncEmpty() {
    if (/[?&]empty=1/.test(location.search) || location.hash === '#empty') root.setAttribute('data-empty', '1');
    else root.removeAttribute('data-empty');
  }
  syncEmpty();
  window.addEventListener('hashchange', syncEmpty);
  function lin(c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(h) { var n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function pick(h) { return ratio(h, '#FFFFFF') >= ratio(h, '#111827') ? '#FFFFFF' : '#111827'; }
  function ok(h) { return /^#[0-9a-fA-F]{6}$/.test(h); }
  document.addEventListener('DOMContentLoaded', function () {
    var pv = document.getElementById('pv');
    function set(kind, hex) {
      if (!ok(hex) || !pv) return;
      hex = hex.toUpperCase();
      if (kind === 'fan') { pv.style.setProperty('--fan', hex); pv.style.setProperty('--on-fan', pick(hex)); }
      else pv.style.setProperty('--personal', hex);
      document.querySelectorAll('[data-bind="' + kind + '"]').forEach(function (el) {
        if (el.type === 'color') el.value = hex.toLowerCase();
        else if (el.classList.contains('hex')) { if (document.activeElement !== el) el.value = hex; el.removeAttribute('aria-invalid'); }
        else if (el.hasAttribute('data-swatch')) el.setAttribute('aria-pressed', String(el.getAttribute('data-swatch').toUpperCase() === hex));
      });
      var out = document.querySelector('[data-auto="' + kind + '"]');
      if (out) out.textContent = (pick(hex) === '#FFFFFF' ? '흰색' : '검정') + ' 글자 · 대비 ' + ratio(hex, pick(hex)).toFixed(1) + ':1';
    }
    document.querySelectorAll('[data-bind]').forEach(function (el) {
      var kind = el.getAttribute('data-bind');
      if (el.type === 'color') el.addEventListener('input', function () { set(kind, el.value); });
      else if (el.classList.contains('hex')) el.addEventListener('input', function () {
        var v = el.value.trim(); if (v[0] !== '#') v = '#' + v;
        if (ok(v)) set(kind, v); else el.setAttribute('aria-invalid', 'true');
      });
      else if (el.hasAttribute('data-swatch')) el.addEventListener('click', function () { set(kind, el.getAttribute('data-swatch')); });
    });
    document.querySelectorAll('[data-count]').forEach(function (ta) {
      var out = document.getElementById(ta.getAttribute('data-count')), max = ta.maxLength;
      function up() { out.textContent = ta.value.length + '/' + max; }
      ta.addEventListener('input', up); up();
    });
    document.querySelectorAll('.sw').forEach(function (b) {
      b.addEventListener('click', function () { b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); });
    });
  });
})();
