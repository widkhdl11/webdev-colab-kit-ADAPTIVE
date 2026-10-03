// 브라우저에서 로그아웃 — 서버가 세션을 끝내고 쿠키를 지운다(INV-L7). 실패해도 첫 화면으로 보낸다.
export async function postLogout(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    return res.ok;
  } catch {
    return false;
  }
}
