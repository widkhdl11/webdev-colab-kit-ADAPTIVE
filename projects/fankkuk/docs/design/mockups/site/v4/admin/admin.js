/* 팬꾹 관리자 시안 공용 스크립트 — 시안용 동작만 (저장·서버 호출 없음) */
(function () {
  var KEY = 'fk-admin-role';
  var body = document.body;

  /* 대표/직원 보기 전환 (시안용 스위치) */
  function setRole(role) {
    body.setAttribute('data-role', role);
    try { localStorage.setItem(KEY, role); } catch (e) {}
    var owner = role === 'owner';
    document.querySelectorAll('.role-name').forEach(function (el) { el.textContent = owner ? '모아' : '라임'; });
    document.querySelectorAll('.role-badge').forEach(function (el) { el.textContent = owner ? '대표' : '직원'; });
    document.querySelectorAll('.role-demo button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.role === role)); });
    document.querySelectorAll('.only-owner').forEach(function (el) {
      if (el.dataset.never) return;
      if (el.matches('input, select, textarea')) { el.disabled = !owner; el.readOnly = !owner; }
      else if (el.matches('button')) {
        el.disabled = !owner;
        if (!el.dataset.label) el.dataset.label = el.textContent;
        el.textContent = owner ? el.dataset.label : '대표만';
      }
    });
    document.dispatchEvent(new CustomEvent('rolechange', { detail: role }));
  }
  var saved = 'owner';
  try { saved = localStorage.getItem(KEY) || 'owner'; } catch (e) {}
  document.querySelectorAll('.role-demo button').forEach(function (b) {
    b.addEventListener('click', function () { setRole(b.dataset.role); });
  });
  setRole(saved === 'staff' ? 'staff' : 'owner');

  /* 상태 탭 + 검색 (같은 표에 같이 적용) */
  document.querySelectorAll('[data-filter]').forEach(function (box) {
    var table = document.getElementById(box.dataset.filter);
    if (!table) return;
    var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));
    var tabs = box.querySelectorAll('.tab');
    var input = box.querySelector('input[type="search"]');
    var current = 'all';
    var empty = table.parentNode.querySelector('.empty');
    tabs.forEach(function (t) {
      var key = t.dataset.tab;
      var n = key === 'all' ? rows.length : rows.filter(function (r) { return r.dataset.status === key; }).length;
      var c = t.querySelector('.n'); if (c) c.textContent = n;
    });
    function apply() {
      var q = input ? input.value.trim().toLowerCase() : '';
      var shown = 0;
      rows.forEach(function (r) {
        var ok = (current === 'all' || r.dataset.status === current) && (!q || r.textContent.toLowerCase().indexOf(q) > -1);
        r.classList.toggle('is-hidden', !ok);
        if (ok) shown++;
      });
      if (empty) empty.hidden = shown !== 0;
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        current = t.dataset.tab;
        tabs.forEach(function (x) { x.setAttribute('aria-pressed', String(x === t)); });
        apply();
      });
    });
    if (input) input.addEventListener('input', apply);
    apply();
  });

  /* 대화상자 열기 — data-dialog="id", data-fill-xxx="값" 을 [data-fill="xxx"] 칸에 채운다 */
  document.querySelectorAll('[data-dialog]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = document.getElementById(b.dataset.dialog);
      if (!d) return;
      Object.keys(b.dataset).forEach(function (k) {
        if (k.indexOf('fill') !== 0) return;
        var name = k.charAt(4).toLowerCase() + k.slice(5);
        d.querySelectorAll('[data-fill="' + name + '"]').forEach(function (el) { el.textContent = b.dataset[k]; });
      });
      d.returnTarget = b;
      d.showModal();
    });
  });
  document.querySelectorAll('dialog [data-close]').forEach(function (b) {
    b.addEventListener('click', function () { b.closest('dialog').close(); });
  });
  document.querySelectorAll('dialog [data-confirm]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = b.closest('dialog');
      var t = d.returnTarget;
      if (t) { t.textContent = t.dataset.doneLabel || '처리했어요'; t.disabled = true; }
      d.close();
    });
  });

  /* 줄 버튼: 눌렀더니 바로 되는 시안용 표시 */
  document.querySelectorAll('[data-done]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.textContent = b.dataset.done; b.disabled = true;
      var tr = b.closest('tr'); if (tr) tr.style.opacity = '.6';
    });
  });

  /* 글자 수 */
  document.querySelectorAll('[data-count]').forEach(function (el) {
    var out = document.getElementById(el.dataset.count);
    var max = el.getAttribute('maxlength');
    function upd() { if (out) out.textContent = el.value.length + ' / ' + max; }
    el.addEventListener('input', upd); upd();
  });
})();
