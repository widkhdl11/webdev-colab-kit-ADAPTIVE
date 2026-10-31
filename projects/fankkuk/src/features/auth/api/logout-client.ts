import { clearAllDrafts } from "@/shared/lib/form-draft/draft-store";

// 브라우저에서 로그아웃 — 서버가 세션을 끝내고 쿠키를 지운다(INV-L7). 실패해도 첫 화면으로 보낸다.
// session-login INV-L20: 직접 로그아웃이면 이 브라우저의 폼 임시 저장을 지운다(기간으로 끝난 로그아웃은 복원하려고 남긴다 — 그쪽은 이 함수를 거치지 않는다).
export async function postLogout(): Promise<boolean> {
  try {
    clearAllDrafts(window.localStorage);
  } catch {
    // 저장소가 막혀 있다 — 지울 것도 없다
  }
  try {
    const res = await fetch("/api/auth/logout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    return res.ok;
  } catch {
    return false;
  }
}
