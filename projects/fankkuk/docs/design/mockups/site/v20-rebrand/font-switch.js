/* 팬꾹 v18 둥근 제목 글꼴 비교 스위치 (시안용)
   주소 ?font=round -> <html data-font="round">, ?font=default -> 해제. 같은 탭 안에서는 sessionStorage 로 유지. */
(function () {
  var K = 'fankkuk-font', root = document.documentElement, v = null;
  var q = new URLSearchParams(location.search).get('font');
  try {
    if (q === 'round') sessionStorage.setItem(K, 'round');
    else if (q === 'default') sessionStorage.removeItem(K);
    v = sessionStorage.getItem(K);
  } catch (e) { v = q; }
  if (v === 'round') {
    root.setAttribute('data-font', 'round');
    var l = document.createElement('link');   /* 티머니 둥근바람은 켰을 때만 불러온다 */
    l.rel = 'stylesheet';
    l.href = 'https://cdn.jsdelivr.net/gh/fonts-archive/TmoneyRoundWind/TmoneyRoundWind.css';
    document.head.appendChild(l);
  } else {
    root.removeAttribute('data-font');
  }
})();
