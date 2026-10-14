/* 팬꾹 v19 사이드바 시안 — v18 사이드바 스크립트 그대로 + B안 토글 */
    /* 8단계 사이드바 상태. 펼침 240 / 접힘 64, 둘 다 본문을 밀고 당긴다(가리지 않음). 접힘 상태 localStorage "sidebar-collapsed"(저장값 우선, 없으면 기본 펼침·1024 이하는 접힘).
       html[data-collapsed] = 접힘(PC), html[data-open] = drawer 열림(휴대폰). 단축키 [ = 펼침/접힘 토글. */
    (function () {
      var K = 'sidebar-collapsed', root = document.documentElement, collapsed, open = false, stored = null;
      try { stored = localStorage.getItem(K); } catch (e) {}
      if (stored === '1' || stored === '0') collapsed = stored === '1'; else collapsed = window.matchMedia('(max-width: 1024px)').matches;
      if (/[?&]empty=1/.test(location.search)) root.setAttribute('data-empty', '1');
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
        mark.addEventListener('click', function () { setCollapsed(false); fold.focus(); });
        fold.addEventListener('click', function () { setCollapsed(true); mark.focus(); });
        ob.addEventListener('click', function () { setOpen(true); cb.focus(); });
        cb.addEventListener('click', function () { setOpen(false); ob.focus(); });
        sb.addEventListener('click', function (e) { if (e.target.closest('.sb-nav a') && open) setOpen(false); });
        document.addEventListener('click', function (e) {
          document.querySelectorAll('details.sb-menu[open], details.fc-more[open]').forEach(function (d) { if (!d.contains(e.target)) d.open = false; });
        });
        document.addEventListener('keydown', function (e) {
          var t = e.target, tag = t && t.tagName;
          if (e.key === 'Escape') {
            document.querySelectorAll('details[open]').forEach(function (d) { d.open = false; });
            if (open) { setOpen(false); ob.focus(); }
            return;
          }
          if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey && !narrow() && !(t && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable))) setCollapsed(!collapsed);
        });
        /* v19: 「팬에게 보내기」 펼침/접힘 줄 (B안). 접힘(64)에서는 하위가 숨겨지므로 누르면 사이드바를 펼치고 하위를 연다 */
        var tg = $('sb-grp-toggle'), sub = $('sb-grp-sub');
        if (tg && sub) tg.addEventListener('click', function () {
          if (root.hasAttribute('data-collapsed')) { setCollapsed(false); sub.hidden = false; tg.setAttribute('aria-expanded', 'true'); tg.focus(); return; }
          var ex = tg.getAttribute('aria-expanded') === 'true';
          tg.setAttribute('aria-expanded', String(!ex)); sub.hidden = ex;
        });
      });
    })();
