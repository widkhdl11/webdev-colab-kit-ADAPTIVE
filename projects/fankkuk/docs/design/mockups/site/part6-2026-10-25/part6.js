/* 6파트 시안 공용 — 시안 막대의 상태 단추와 번호 표시. 데이터·서버 호출 없음.
   data-only="상태1 상태2" 가 달린 칸은 그 상태에서만 보인다. 주소 뒤 #상태 로 바로 열 수 있고, ?shot 이면 막대를 숨긴다(캡처용). */
(function () {
  var b = document.body;
  if (/[?&]shot/.test(location.search)) b.classList.add("shot");
  var btns = [].slice.call(document.querySelectorAll(".mockbar [data-st]"));
  function set(s) {
    b.setAttribute("data-st", s);
    [].forEach.call(document.querySelectorAll("[data-only]"), function (e) {
      e.hidden = e.getAttribute("data-only").split(" ").indexOf(s) < 0;
    });
    btns.forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-st") === s)); });
  }
  btns.forEach(function (x) {
    x.addEventListener("click", function () {
      set(x.getAttribute("data-st"));
      history.replaceState(null, "", "#" + x.getAttribute("data-st"));
    });
  });
  var first = btns.length ? btns[0].getAttribute("data-st") : "";
  var want = location.hash.slice(1);
  set(btns.some(function (x) { return x.getAttribute("data-st") === want; }) ? want : first);
  var mk = document.getElementById("mkBtn");
  function setMk(on) { b.classList.toggle("show-mk", on); mk.setAttribute("aria-pressed", String(on)); }
  if (mk) mk.addEventListener("click", function () { setMk(!b.classList.contains("show-mk")); });
  if (/[?&]mk/.test(location.search) && mk) setMk(true);
})();
