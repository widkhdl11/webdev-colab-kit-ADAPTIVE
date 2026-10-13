/* 글꼴 비교 스위치: 주소에 ?font=pretendard 가 있으면 <html data-font="pretendard"> 를 단다. 기본은 티머니 둥근바람. */
(function () {
  if (/[?&]font=pretendard(&|$)/.test(location.search)) document.documentElement.setAttribute("data-font", "pretendard");
})();
