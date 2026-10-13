/* 비교 스위치 — 주소에 붙이면 그 탭 안에서 다른 화면으로 넘어가도 유지된다. ?<이름>=default 로 되돌린다.
   ?font=pretendard   글꼴을 Pretendard 로
   ?type=large        글자 크기를 v14 값(48·32·20·18·16, 휴대폰 34·26·20·18·16)으로
   ?badge=…           플랫폼 뱃지 비교안. 기본은 e3(사용자 선택), ?badge=default 는 예전 흰 알약 */
(function () {
  var q = location.search, root = document.documentElement;
  function pick(key, allowed) {
    var m = q.match(new RegExp("[?&]" + key + "=([a-z0-9]+)"));
    var v = null;
    try { v = sessionStorage.getItem("fk-" + key); } catch (e) {}
    if (m) { v = allowed.indexOf(m[1]) >= 0 ? m[1] : null; try { v ? sessionStorage.setItem("fk-" + key, v) : sessionStorage.removeItem("fk-" + key); } catch (e) {} }
    if (v && allowed.indexOf(v) >= 0) root.setAttribute("data-" + key, v);
  }
  pick("font", ["pretendard"]);
  pick("type", ["large"]);
  pick("badge", ["default", "a", "b", "c", "d", "e", "e1", "e2", "e3"]);
  if (!root.getAttribute("data-badge")) root.setAttribute("data-badge", "e3"); // 2026-10-13 사용자 「e3으로 하자」 — 기본값
  if (/^e/.test(root.getAttribute("data-badge") || "")) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound/NanumSquareRound.css"; document.head.appendChild(l); }
})();
