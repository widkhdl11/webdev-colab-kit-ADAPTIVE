/* =====================================================================
   팬꾹 사이트 시안 공통 JS (2026-10-01) — 외부 라이브러리 없음, 시안용 흉내만
   1 선물 아이콘 말풍선(마우스·키보드, Esc 로 닫기)
   2 휴대폰 햄버거 메뉴      3 내 정보 드롭다운      4 바텀시트
   5 탭                      6 실시간 검색 흉내      (window.Fankkuk 로도 노출)
   ===================================================================== */
(function () {
  'use strict';

  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* 1 말풍선 — .gift-item 안의 .gift-icon(aria-describedby → .tip) */
  $all('.gift-item').forEach(function (item) {
    var tip = item.querySelector('.tip');
    if (!tip) return;
    function place() {
      // 화면 오른쪽으로 삐져나가면 왼쪽으로 밀고, 화살표는 아이콘 가운데를 가리키게 한다
      tip.style.transform = 'translateX(-50%)';
      tip.style.removeProperty('--tip-arrow');
      var r = tip.getBoundingClientRect();
      var over = r.right - (window.innerWidth - 8);
      var under = 8 - r.left;
      var shift = over > 0 ? -over : (under > 0 ? under : 0);
      if (shift) {
        tip.style.transform = 'translateX(calc(-50% + ' + shift + 'px))';
        var body = tip.querySelector('.tip-body');
        if (body) body.style.setProperty('--tip-arrow', (r.width / 2 - shift) + 'px');
        tip.style.setProperty('--tip-arrow', (r.width / 2 - shift) + 'px');
      }
    }
    function show() { tip.classList.add('is-open'); place(); }
    function hide() { tip.classList.remove('is-open'); }
    item.addEventListener('mouseenter', show);
    item.addEventListener('mouseleave', hide);
    item.addEventListener('focusin', show);
    item.addEventListener('focusout', hide);
    item.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  });

  /* 2 휴대폰 메뉴 */
  var toggle = document.querySelector('.menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  function setMenu(open) {
    if (!toggle || !mobileMenu) return;
    mobileMenu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }
  if (toggle && mobileMenu) {
    toggle.addEventListener('click', function () { setMenu(mobileMenu.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mobileMenu.hidden) { setMenu(false); toggle.focus(); } });
    window.addEventListener('resize', function () { if (window.innerWidth > 767) setMenu(false); });
  }

  /* 3 내 정보 드롭다운 */
  $all('.user-menu').forEach(function (menu) {
    var btn = menu.querySelector('.user-btn');
    var panel = menu.querySelector('.user-dropdown');
    if (!btn || !panel) return;
    function set(open) { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function () { set(panel.hidden); });
    document.addEventListener('click', function (e) { if (!menu.contains(e.target)) set(false); });
    menu.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
  });

  /* 4 바텀시트 — [data-sheet-open="id"] 가 #id(.sheet-root)를 연다 */
  var lastOpener = null;
  function openSheet(id, opener) {
    var root = document.getElementById(id);
    if (!root) return;
    lastOpener = opener || null;
    root.hidden = false;
    document.body.classList.add('no-scroll');
    var close = root.querySelector('.sheet-close');
    if (close) close.focus();
  }
  function closeSheet(root) {
    root.hidden = true;
    document.body.classList.remove('no-scroll');
    if (lastOpener) lastOpener.focus();
  }
  $all('[data-sheet-open]').forEach(function (b) {
    b.addEventListener('click', function () { openSheet(b.getAttribute('data-sheet-open'), b); });
  });
  $all('.sheet-root').forEach(function (root) {
    $all('[data-sheet-close]', root).forEach(function (el) { el.addEventListener('click', function () { closeSheet(root); }); });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeSheet(root); return; }
      if (e.key !== 'Tab') return;
      // 시트 안에서만 포커스가 돈다
      var f = $all('a[href], button:not([disabled]), input, select, textarea', root);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  });

  /* 5 탭 — <div class="tabs" role="tablist" data-tabs> 안의 button.tab[aria-controls] */
  $all('[data-tabs]').forEach(function (list) {
    var tabs = $all('[role="tab"]', list);
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var p = document.getElementById(t.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (n === null) return;
        var next = tabs[(n + tabs.length) % tabs.length];
        select(next); next.focus(); e.preventDefault();
      });
    });
  });

  /* 6 실시간 검색 흉내 — 입력값으로 목록의 data-search 를 거른다 (서버 호출 없음)
     쓰는 법:
       <input data-live-filter data-target="#list" data-empty="#empty" data-count="#count">
       <ul id="list"><li data-search="하루 haru 게임 방송">…</li></ul>
       <p id="empty" hidden>…</p>   <span id="count"></span>
     data-search 에 이름·채널·별칭을 공백으로 이어 적어 둔다. 띄어쓰기·대소문자는 무시. */
  function norm(s) { return String(s).toLowerCase().replace(/\s+/g, ''); }
  function liveFilter(input, opts) {
    var list = document.querySelector(opts.target);
    if (!list) return;
    var items = $all('[data-search]', list);
    var empty = opts.empty ? document.querySelector(opts.empty) : null;
    var count = opts.count ? document.querySelector(opts.count) : null;
    function run() {
      var q = norm(input.value);
      var shown = 0;
      items.forEach(function (it) {
        var hit = !q || norm(it.getAttribute('data-search')).indexOf(q) !== -1;
        it.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
      if (count) count.textContent = q ? ('검색 결과 ' + shown + '명') : ('전체 ' + items.length + '명');
    }
    input.addEventListener('input', run);
    run();
  }
  $all('[data-live-filter]').forEach(function (input) {
    liveFilter(input, { target: input.getAttribute('data-target'), empty: input.getAttribute('data-empty'), count: input.getAttribute('data-count') });
  });

  window.Fankkuk = { liveFilter: liveFilter, openSheet: openSheet };
})();
