/**
 * 같은 사이트의 화면이 fetch 로 보낸 JSON 요청인가.
 * 다른 사이트의 폼은 Origin 이 다르거나, 단순 전송(text/plain·폼 인코딩)이라 JSON 이 아니다.
 * SameSite=Lax 쿠키는 다른 사이트 요청에 쿠키를 싣지 않을 뿐, 새로 로그인시키는 요청(로그인 CSRF)은 막지 못해 이 검사가 따로 필요하다.
 */
export function isSameOriginJson(req: { headers: Headers; origin: string }): boolean {
  const origin = req.headers.get("origin");
  const type = req.headers.get("content-type") ?? "";
  return origin === req.origin && /^application\/json(\s*;|$)/i.test(type);
}
