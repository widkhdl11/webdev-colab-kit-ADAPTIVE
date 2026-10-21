/* 보낸 역조공 시안 전용 — 상태 바꿔 보기, 받는 주소 6자리 보기. 사이트 코드가 아니다. */
(function () {
  var root = document.querySelector('[data-sent]');
  if (!root) return;
  var $$ = function (s) { return Array.prototype.slice.call(root.querySelectorAll(s)); };
  function setState(v) {
    var paid = v === 'paid', empty = v === 'empty';
    $$('[data-if-paid]').forEach(function (e) { e.hidden = !paid; });
    $$('[data-if-list]').forEach(function (e) { e.hidden = empty; });
    $$('[data-if-empty]').forEach(function (e) { e.hidden = !empty; });
    var first = root.querySelector('details.batch');
    if (first) first.open = true;
    var c = root.querySelector('[data-batch-count]');
    if (c) c.textContent = empty ? '0' : '3';
    $$('[data-mock-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mock-view') === v)); });
  }
  $$('[data-mock-view]').forEach(function (b) { b.addEventListener('click', function () { setState(b.getAttribute('data-mock-view')); }); });
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-code-toggle]');
    if (!b) return;
    var box = b.closest('.addr2');
    var code = box.querySelector('.code');
    var on = b.getAttribute('data-shown') === 'true';
    b.setAttribute('data-shown', String(!on));
    code.textContent = on ? '••••••' : code.getAttribute('data-code');
    b.querySelector('.t').textContent = on ? '6자리 보기' : '6자리 가리기';
  });
  var h = location.hash.replace('#', '');
  setState(h === 'paid' || h === 'empty' ? h : 'list');
})();
