// 글꼴 비교용 — 주소 뒤 ?font=<이름> 으로 시안의 글꼴을 바꾼다. 값이 없으면 시안 원래 글꼴(Pretendard).
window.FONT_CANDIDATES = {
  pretendard: { label: "Pretendard (지금)", css: [], body: '"Pretendard Variable",Pretendard', note: "지금 쓰는 글꼴. 반듯하고 중립적" },
  suit: { label: "SUIT", css: ["https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css"], body: '"SUIT Variable"', note: "기하학적인 현대 고딕. 글자 폭이 좁고 또렷하다" },
  wanted: { label: "Wanted Sans", css: ["https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css"], body: '"Wanted Sans Variable"', note: "동그란 획이 섞인 현대 고딕. 숫자·영문이 특히 세련됐다" },
  nsneo: { headWeight: 800, label: "나눔스퀘어 네오", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareNeo/NanumSquareNeo.css"], body: '"Nanum Square Neo"', note: "네모난 틀의 둥근 고딕. 친근하고 정돈됐다" },
  nsround: { group: "cute", headWeight: 800, label: "나눔스퀘어 라운드", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound/NanumSquareRound.css"], body: '"Nanum Square Round"', note: "획 끝이 둥글다. 가장 귀여운 쪽" },
  paperlogy: { label: "페이퍼로지", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/Paperlogy/Paperlogy.css"], body: '"Paperlogy"', note: "기하학적이고 모양이 분명하다. 제목에서 개성이 크다" },
  gmarket: { label: "G마켓 산스 제목 + SUIT 본문", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/GmarketSans/GmarketSans.css", "https://cdn.jsdelivr.net/gh/sun-typeface/SUIT@2/fonts/variable/woff2/SUIT-Variable.css"], body: '"SUIT Variable"', head: '"Gmarket Sans"', note: "제목만 굵고 둥근 글꼴로 개성을 주고 본문은 차분하게" },
  // 2026-10-12 「더 귀여운 글꼴은 없어?」 — 귀여운 쪽. 굵기가 하나뿐인 글꼴은 가짜 굵게를 막고(synth) 제목에만 쓴다.
  ssurround: { group: "cute", label: "카페24 써라운드 (제목) + 써라운드 에어 (본문)", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/Cafe24Ssurround/Cafe24Ssurround.css", "https://cdn.jsdelivr.net/gh/fonts-archive/Cafe24SsurroundAir/Cafe24SsurroundAir.css"], body: '"Cafe24 Ssurround Air"', head: '"Cafe24 Ssurround"', headWeight: 400, synth: true, note: "통통하고 둥근 제목, 같은 집안의 가는 본문. 말랑한 인상" },
  tmoney: { group: "cute", label: "티머니 둥근바람", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/TmoneyRoundWind/TmoneyRoundWind.css"], body: '"Tmoney Round Wind"', headWeight: 800, synth: true, note: "둥근 고딕 하나로 제목·본문 모두. 귀여우면서 본문도 읽힌다" },
  cookierun: { group: "cute", label: "쿠키런 (제목) + 나눔스퀘어 라운드 (본문)", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/CookieRun/CookieRun.css", "https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound/NanumSquareRound.css"], body: '"Nanum Square Round"', head: '"CookieRun"', headWeight: 900, synth: true, note: "말랑한 게임 글씨 제목. 가장 장난스럽다" },
  jua: { group: "cute", label: "배민 주아 (제목) + 나눔스퀘어 라운드 (본문)", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/BMJUA/BMJUA.css", "https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound/NanumSquareRound.css"], body: '"Nanum Square Round"', head: '"BM JUA"', headWeight: 400, synth: true, note: "붓으로 그린 듯 둥근 제목. 친근하고 손맛이 있다" },
  hanna: { group: "cute", label: "배민 한나 Pro (제목) + 나눔스퀘어 라운드 (본문)", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/BMHANNAPro/BMHANNAPro.css", "https://cdn.jsdelivr.net/gh/fonts-archive/NanumSquareRound/NanumSquareRound.css"], body: '"Nanum Square Round"', head: '"BM HANNA Pro"', headWeight: 400, synth: true, note: "단단하고 동글한 제목. 귀엽지만 덜 장난스럽다" },
  dunggeunmiso: { group: "cute", label: "학교안심 둥근미소", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/HakgyoansimDunggeunmiso/HakgyoansimDunggeunmiso.css"], body: '"Hakgyoansim Dunggeunmiso"', headWeight: 700, synth: true, note: "손글씨 느낌이 섞인 둥근 글꼴 하나로 전부" },
  maple: { group: "cute", label: "메이플스토리", css: ["https://cdn.jsdelivr.net/gh/fonts-archive/Maplestory/Maplestory.css"], body: '"Maplestory"', headWeight: 700, synth: true, note: "게임 글꼴. 통통하고 개성이 강하다" },
};
(function () {
  var key = new URLSearchParams(location.search).get("font");
  var f = key && window.FONT_CANDIDATES[key];
  if (!f) return;
  f.css.forEach(function (href) { var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); });
  var fallback = ',-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif';
  var css = "body,button,input,select,textarea{font-family:" + f.body + fallback + " !important}";
  if (f.head) css += "h1,h2,h3,.hero-title,.price-amount{font-family:" + f.head + fallback + " !important;letter-spacing:0 !important}";
  if (f.headWeight) css += "h1,h2,h3,.hero-title,.price-amount,.btn{font-weight:" + f.headWeight + " !important}";
  if (f.synth) css += "*{font-synthesis:none !important}";
  // 나눔스퀘어 계열은 같은 700 이어도 획이 가늘어 제목·버튼을 800 으로 맞춰 비교한다
  var s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
  document.title = document.title + " · " + f.label;
})();
