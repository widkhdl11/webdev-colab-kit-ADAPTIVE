/* 팬꾹 시안 v21 추가 요청 3 — 팬 화면 공통 스크립트 (시안용, 로직 없음).
   1) 사이드바 접기·서랍 (v18 시안과 같은 동작, 처음에는 펼침. 저장값이 있으면 그 값)
   2) 글자 수 세기  [data-count-for=칸id][data-max=숫자]
   3) 시안 보기 스위치 [data-demo-group] 안의 button[data-show] 로 [data-s] 칸을 보였다 숨겼다
   4) 켜고 끄는 스위치 .sw[role=switch] */
(function () {
  var K = 'sidebar-collapsed', root = document.documentElement, collapsed = false, open = false, stored = null;
  try { stored = localStorage.getItem(K); } catch (e) {}
  if (stored === '1') collapsed = true;
  function narrow() { return getComputedStyle(root).getPropertyValue('--app-narrow').trim() !== 'none'; }
  function $(id) { return document.getElementById(id); }
  function apply() {
    var n = narrow(), col = collapsed && !n;
    if (!n) open = false;
    if (col) root.setAttribute('data-collapsed', '1'); else root.removeAttribute('data-collapsed');
    if (open) root.setAttribute('data-open', '1'); else root.removeAttribute('data-open');
    var o = $('sb-open'), m = $('sb-mark');
    if (o) o.setAttribute('aria-expanded', String(open));
    if (m) m.setAttribute('aria-expanded', String(!col));
  }
  function setCollapsed(v) { collapsed = v; try { localStorage.setItem(K, v ? '1' : '0'); } catch (e) {} apply(); }
  function setOpen(v) { open = v; apply(); }
  apply();
  window.addEventListener('resize', apply);

  document.addEventListener('DOMContentLoaded', function () {
    apply();
    var sb = $('sidebar'), mark = $('sb-mark'), fold = $('sb-fold'), ob = $('sb-open'), cb = $('sb-close');
    if (sb && mark && fold && ob && cb) {
      mark.addEventListener('click', function () { setCollapsed(false); fold.focus(); });
      fold.addEventListener('click', function () { setCollapsed(true); mark.focus(); });
      ob.addEventListener('click', function () { setOpen(true); cb.focus(); });
      cb.addEventListener('click', function () { setOpen(false); ob.focus(); });
      sb.addEventListener('click', function (e) { if (e.target.closest('.sb-nav a') && open) setOpen(false); });
      var scrim = $('sb-scrim'); if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
    }
    document.addEventListener('click', function (e) {
      document.querySelectorAll('details.sb-menu[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
    });
    document.addEventListener('keydown', function (e) {
      var t = e.target, tag = t && t.tagName;
      if (e.key === 'Escape') {
        document.querySelectorAll('details.sb-menu[open]').forEach(function (d) { d.open = false; });
        if (open) { setOpen(false); if (ob) ob.focus(); }
        return;
      }
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey && !narrow() && !(t && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable))) setCollapsed(!collapsed);
    });

    /* 글자 수 */
    document.querySelectorAll('[data-count-for]').forEach(function (out) {
      var inp = document.getElementById(out.getAttribute('data-count-for')), max = +out.getAttribute('data-max');
      if (!inp) return;
      function upd() {
        var n = Array.from(inp.value).length;
        out.textContent = n + ' / ' + max + '자';
        out.setAttribute('data-over', n > max ? '1' : '0');
      }
      inp.addEventListener('input', upd); upd();
    });

    /* 시안 보기 스위치 */
    document.querySelectorAll('[data-demo-group]').forEach(function (g) {
      var group = g.getAttribute('data-demo-group');
      function show(v) {
        g.querySelectorAll('button[data-show]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-show') === v)); });
        document.querySelectorAll('[data-s^="' + group + ':"]').forEach(function (el) {
          el.hidden = el.getAttribute('data-s').split(':')[1].split(',').indexOf(v) < 0;
        });
        document.dispatchEvent(new CustomEvent('demo', { detail: { group: group, value: v } }));
      }
      g.addEventListener('click', function (e) { var b = e.target.closest('button[data-show]'); if (b) show(b.getAttribute('data-show')); });
      var q = new URLSearchParams(location.search).get(group);
      show(q && g.querySelector('button[data-show="' + q + '"]') ? q : (g.getAttribute('data-initial') || g.querySelector('button[data-show]').getAttribute('data-show')));
    });

    /* 켜고 끄는 스위치 */
    document.querySelectorAll('.sw[role="switch"]').forEach(function (s) {
      s.addEventListener('click', function () { s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true')); });
    });
  });
})();
