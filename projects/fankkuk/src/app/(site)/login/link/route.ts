import { linkLoginPageHtml } from "@/features/auth/lib/link-login-page";

// 로그인 링크 페이지 — 알림톡 버튼 주소 `/login/link#t=<토큰>` (docs/specs/link-login.md INV-K3·K5).
// 여는 것(GET)은 아무것도 쓰지 않는다: DB·Auth 를 부르지 않고 한 장짜리 HTML 만 돌려준다. 토큰은 # 뒤라 이 요청에 오지 않고, 그 페이지의 스크립트가 POST 로 보낸다.
// 사이트 공통 틀(바깥 글꼴을 부른다)을 쓰지 않으려고 페이지 대신 라우트로 둔다(INV-K5). 로그인 여부와 상관없이 열린다(proxy 는 갱신만 한다).

export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response(linkLoginPageHtml(), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // INV-K5: 이 페이지에서 나가는 요청에 주소(토큰 포함)를 싣지 않는다 — 사이트 공통 값(strict-origin-when-cross-origin)보다 좁다
      "Referrer-Policy": "no-referrer",
    },
  });
}
