/**
 * 같은 사이트의 경로로 보내는 303 응답. Location 에 주소(호스트) 없이 경로만 싣는다 —
 * 브라우저는 그 경로를 지금 열려 있는 주소에 붙여 이동한다.
 *
 * 서버가 아는 자기 이름으로 주소를 완성하면 개발 서버를 127.0.0.1 로 열었을 때 localhost 로 보내
 * 로그인 쿠키가 없는 쪽으로 넘어갔다(2026-10-03, 결제 뒤 로그인이 풀려 보임).
 * Host 헤더로 주소를 만들지 않는 이유는 그 헤더를 바꿔 보내면 다른 사이트로 보낼 수 있어서다.
 */
export function seeOther(path: string): Response {
  // 브라우저는 주소를 읽을 때 탭·줄바꿈을 지운다 — "/\t/evil.example" 은 "//evil.example" 이 된다.
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\") || /[\x00-\x1f\x7f]/.test(path)) {
    throw new Error("seeOther 는 같은 사이트의 경로만 받는다");
  }
  return new Response(null, { status: 303, headers: { Location: path } });
}
