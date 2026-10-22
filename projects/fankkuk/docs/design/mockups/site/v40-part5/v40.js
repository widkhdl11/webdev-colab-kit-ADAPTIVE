/* v40 시안 전용 동작 — 회색 막대(.mockbar)로 상태 바꿔 보기, 카드 줄 화살표. 사이트 로직 아님. */
(function () {
  var body = document.body;
  document.querySelectorAll('.mockbar .mb-grp').forEach(function (grp) {
    var btns = Array.prototype.slice.call(grp.querySelectorAll('button'));
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.hasAttribute('data-toggle')) {
          var on = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', String(on));
          body.classList.toggle(b.getAttribute('data-toggle'), on);
          return;
        }
        btns.forEach(function (o) {
          (o.getAttribute('data-cls') || '').split(' ').forEach(function (c) { if (c) body.classList.remove(c); });
          o.setAttribute('aria-pressed', String(o === b));
        });
        (b.getAttribute('data-cls') || '').split(' ').forEach(function (c) { if (c) body.classList.add(c); });
        syncRows();
      });
    });
  });
  function syncRows() {
    document.querySelectorAll('.cardRow').forEach(function (row) {
      var id = row.id;
      var max = row.scrollWidth - row.clientWidth;
      var atStart = row.scrollLeft <= 2, atEnd = row.scrollLeft >= max - 2;
      row.toggleAttribute('data-more-left', !atStart);
      row.toggleAttribute('data-more-right', !atEnd && max > 2);
      document.querySelectorAll('.rowArrow[data-row="' + id + '"]').forEach(function (btn) {
        var prev = btn.classList.contains('rowPrev');
        var off = prev ? atStart : (atEnd || max <= 2);
        if (btn.classList.contains('hdr')) btn.disabled = off; else btn.hidden = off;
      });
    });
  }
  document.querySelectorAll('.rowArrow').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = document.getElementById(btn.getAttribute('data-row'));
      var li = row.querySelector('li');
      row.scrollBy({ left: (btn.classList.contains('rowPrev') ? -1 : 1) * (li.getBoundingClientRect().width + 24) });
    });
  });
  document.querySelectorAll('.cardRow').forEach(function (row) { row.addEventListener('scroll', syncRows, { passive: true }); });
  window.addEventListener('resize', syncRows);
  syncRows();
  // 칩·접기 같은 작은 조작
  document.querySelectorAll('.chips button').forEach(function (b) {
    b.addEventListener('click', function () {
      b.parentNode.querySelectorAll('button').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
    });
  });
})();
