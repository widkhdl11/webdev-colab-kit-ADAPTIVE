/* 비교 페이지 전용 — 칸 안의 화면(iframe·그림)을 정해진 폭(1440·390)으로 그린 뒤 칸 폭에 맞게 줄인다. 사이트 코드가 아니다. */
(function () {
  function fit() {
    document.querySelectorAll('[data-shot]').forEach(function (box) {
      var w = Number(box.dataset.w);
      var el = box.firstElementChild;
      var sc = Math.min(1, box.clientWidth / w);
      var h;
      if (el.tagName === 'IFRAME') {
        var fixed = box.dataset.vh ? Number(box.dataset.vh) : 0;
        var full = 0;
        try { full = el.contentDocument.documentElement.scrollHeight; } catch (e) { full = 1200; }
        h = fixed || full || 1200;
        el.style.width = w + 'px';
        el.style.height = h + 'px';
      } else {
        h = el.naturalHeight * (w / (el.naturalWidth || w));
        el.style.width = w + 'px';
        el.style.height = 'auto';
      }
      el.style.transform = 'scale(' + sc + ')';
      box.style.height = Math.ceil(h * sc) + 'px';
    });
  }
  document.querySelectorAll('[data-shot] iframe').forEach(function (f) { f.addEventListener('load', function () { setTimeout(fit, 50); }); });
  document.querySelectorAll('[data-shot] img').forEach(function (i) { if (i.complete) fit(); else i.addEventListener('load', fit); });
  window.addEventListener('resize', fit);
  fit();
})();
