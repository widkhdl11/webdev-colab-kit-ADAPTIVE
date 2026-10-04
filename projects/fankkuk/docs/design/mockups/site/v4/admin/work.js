/* 팬꾹 관리자 작업 화면 시안용 동작 — 저장·서버 호출 없음. 결과 전환·단계 전환만. */
(function () {
  /* 시안용 전환: [data-case-group] 안의 버튼 data-case-btn="x" 가 [data-case="x"] 를 보인다 */
  document.querySelectorAll('[data-case-group]').forEach(function (g) {
    var name = g.dataset.caseGroup;
    var btns = g.querySelectorAll('[data-case-btn]');
    function show(k) {
      btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.caseBtn === k)); });
      document.querySelectorAll('[data-case-of="' + name + '"]').forEach(function (p) { p.hidden = p.dataset.case !== k; });
      document.dispatchEvent(new CustomEvent('casechange', { detail: { group: name, key: k } }));
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.caseBtn); }); });
    show(btns[0].dataset.caseBtn);
  });
  /* 단계 안에서 다음 칸으로: data-reveal="id" 보이기, data-conceal="id id" 숨기기 */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-reveal],[data-conceal]');
    if (!t || t.disabled) return;
    (t.dataset.conceal || '').split(' ').filter(Boolean).forEach(function (id) { var el = document.getElementById(id); if (el) el.hidden = true; });
    (t.dataset.reveal || '').split(' ').filter(Boolean).forEach(function (id) { var el = document.getElementById(id); if (el) el.hidden = false; });
    var f = t.dataset.focus && document.getElementById(t.dataset.focus); if (f) f.focus();
    if (t.dataset.pending) { var p = document.getElementById('pending-line'); if (p) p.dispatchEvent(new CustomEvent('set', { detail: t.dataset.pending })); }
  });
  var pl = document.getElementById('pending-line');
  if (pl) pl.addEventListener('set', function (e) {
    var on = e.detail === 'on';
    pl.classList.toggle('is-on', on);
    pl.querySelector('.txt').textContent = on ? pl.dataset.onText : pl.dataset.offText;
  });
  var first = document.querySelector('[data-autofocus]'); if (first) first.focus();
})();
