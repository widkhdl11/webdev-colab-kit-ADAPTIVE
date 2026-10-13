/* 팬꾹 시안 v12-A 광고 배너 슬라이드 (2026-10-13)
   5초 자동 넘김 / 멈춤 버튼 / 마우스·초점이 들어가면 멈춤 / 움직임 줄이기면 자동 넘김 끔 / 밀어서 넘기기.
   시안용 — 데이터·서버 호출 없음. */
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.ad-banner').forEach(function (root) {
    var track = root.querySelector('.ad-track');
    var slides = [].slice.call(track.children);
    var dots = [].slice.call(root.querySelectorAll('.ad-dot'));
    var pauseBtn = root.querySelector('.ad-pause');
    var viewport = root.querySelector('.ad-viewport');
    var i = 0, timer = null, userPaused = reduce.matches, inside = false;

    function show(n) {
      i = (n + slides.length) % slides.length;
      track.style.transform = 'translateX(-' + i * 100 + '%)';
      slides.forEach(function (s, k) {
        s.classList.toggle('is-on', k === i);
        s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
        if (k === i) s.removeAttribute('inert'); else s.setAttribute('inert', '');
      });
      dots.forEach(function (d, k) {
        if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
      });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function sync() {
      stop();
      track.setAttribute('aria-live', userPaused || inside ? 'polite' : 'off');
      if (!userPaused && !inside && !reduce.matches) timer = setInterval(function () { show(i + 1); }, 5000);
    }
    function label() {
      pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      pauseBtn.setAttribute('aria-label', userPaused ? '자동 넘김 다시 시작' : '자동 넘김 멈추기');
    }

    root.querySelector('.ad-prev').addEventListener('click', function () { show(i - 1); });
    root.querySelector('.ad-next').addEventListener('click', function () { show(i + 1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); }); });
    pauseBtn.addEventListener('click', function () { userPaused = !userPaused; label(); sync(); });
    root.addEventListener('mouseenter', function () { inside = true; sync(); });
    root.addEventListener('mouseleave', function () { inside = root.contains(document.activeElement); sync(); });
    root.addEventListener('focusin', function () { inside = true; sync(); });
    root.addEventListener('focusout', function () {
      setTimeout(function () { inside = root.matches(':hover') || root.contains(document.activeElement); sync(); }, 0);
    });

    /* 손가락으로 밀어 넘기기 */
    var x0 = null;
    viewport.addEventListener('pointerdown', function (e) { if (e.pointerType !== 'mouse') x0 = e.clientX; });
    viewport.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0; x0 = null;
      if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
    });
    viewport.addEventListener('pointercancel', function () { x0 = null; });

    show(0); label(); sync();
  });
})();
