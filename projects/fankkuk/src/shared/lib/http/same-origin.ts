/**
 * 같은 사이트의 화면이 fetch 로 보낸 JSON 요청인가.
 * 다른 사이트의 폼은 Origin 이 다르거나, 단순 전송(text/plain·폼 인코딩)이라 JSON 이 아니다.
 * SameSite=Lax 쿠키는 다른 사이트 요청에 쿠키를 싣지 않을 뿐, 새로 로그인시키는 요청(로그인 CSRF)은 막지 못해 이 검사가 따로 필요하다.
 *
 * Origin 은 요청이 실제로 들어온 주소(Host 헤더)와 비교한다. 서버가 아는 자기 이름과 비교하면
 * 개발 서버를 127.0.0.1 로 열었을 때 서버는 localhost 로 알고 있어 같은 사이트 요청도 막혔다(2026-10-02).
 */
export function isSameOriginJson(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("host");
  const type = headers.get("content-type") ?? "";
  if (!origin || !host || !/^application\/json(\s*;|$)/i.test(type)) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * 같은 사이트의 화면이 보낸 요청인가 — 본문 종류는 보지 않는다(파일 올리기처럼 JSON 이 아닌 요청).
 * Origin 이 없거나 요청이 들어온 주소와 다르면 받지 않는다. 다른 사이트의 폼이 로그인한 사람 몰래 올리지 못하게.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
