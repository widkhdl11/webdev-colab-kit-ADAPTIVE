import { LINK_LOGIN_FAILED_PATH } from "@/entities/session/model/login-link";

// 로그인 링크 페이지의 HTML (docs/specs/link-login.md INV-K3·K5).
// 사이트의 공통 틀(글꼴·머리줄)을 쓰지 않는 한 장짜리 페이지다 — 공통 틀은 바깥 글꼴 파일을 부르는데, 이 페이지는 외부 리소스를 부르지 않는다(INV-K5).
// 토큰은 주소의 # 뒤(`/login/link#t=<토큰>`)에 있다 — # 뒤는 브라우저가 서버로 보내지 않아 호스팅 요청 기록에 남지 않는다(INV-K1·S3, 2026-10-31 보안 리뷰).
// 쿼리(`?t=`)로 온 값은 읽지도 보내지도 않는다 — 그 주소는 이미 서버 기록에 남았다.
// 페이지를 여는 것(GET)은 아무것도 쓰지 않는다. 스크립트가 # 뒤의 t 를 읽어 같은 사이트 JSON POST 로 보내고(INV-K3),
// 응답을 받으면 주소창에서 토큰(# 뒤·쿼리 모두)을 지운 뒤 서버가 준 같은 사이트 경로로 간다. 스크립트가 돌지 않으면(링크 미리보기 로봇) 토큰은 그대로 남는다(S2).
// 이동은 location.replace — 토큰이 붙은 주소가 뒤로 가기 기록에 남지 않는다. window.__fkMove 는 시험(jsdom)이 이동을 기록하는 자리다.

const TEXT = "로그인하는 중입니다.";

const SCRIPT = `(function () {
  var failed = ${JSON.stringify(LINK_LOGIN_FAILED_PATH)};
  var move = window.__fkMove || function (to) { window.location.replace(to); };
  var sitePath = function (p) { return typeof p === "string" && /^\\/(?![\\/\\\\])/.test(p) ? p : failed; };
  var clear = function () { try { window.history.replaceState(null, "", window.location.pathname); } catch (e) {} };
  var t = new URLSearchParams(window.location.hash.slice(1)).get("t");
  if (!t) { clear(); move(failed); return; }
  fetch("/api/auth/link", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ t: t })
  }).then(function (res) { return res.json(); }).then(function (body) {
    clear();
    move(body && body.ok === true ? sitePath(body.next) : sitePath(body && body.next));
  }, function () {
    clear();
    move(failed);
  });
})();`;

/** 링크 페이지 한 장. 토큰은 본문에 넣지 않는다 — 스크립트가 주소에서 읽는다. */
export function linkLoginPageHtml(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>팬꾹 로그인</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;font-size:16px;color:#1f1f1f;background:#fff}</style>
</head>
<body>
<main><p role="status">${TEXT}</p></main>
<script>${SCRIPT}</script>
</body>
</html>`;
}
