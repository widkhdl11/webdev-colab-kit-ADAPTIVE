import { safeNextPath } from "./safe-next-path";

// admin-console INV-K13: 운영자 로그인 뒤 돌아갈 곳은 관리자 화면 주소만. 그 밖의 값(사이트 다른 곳·다른 사이트·로그인 화면 자신)이면 관리자 첫 화면.
// 같은 사이트 경로인지는 safeNextPath 하나가 본다(session-login INV-L13) — 여기는 그 결과가 관리자 주소인지만 더 본다.

export const ADMIN_HOME_PATH = "/admin";
export const ADMIN_LOGIN_PATH = "/admin/login";

/** 브라우저가 실제로 갈 경로로 바꾼다 — 「..」·「%2e%2e」를 풀어 놓아야 관리자 주소인지 볼 수 있다(/admin/../gifts 는 /gifts 로 간다) */
function normalized(p: string): URL {
  return new URL(p, "http://same.site");
}

/** 관리자 화면 주소인가 — /admin 과 그 아래(로그인 화면은 뺀다) */
export function isAdminPagePath(path: string): boolean {
  if (path === ADMIN_LOGIN_PATH || path.startsWith(`${ADMIN_LOGIN_PATH}/`)) return false;
  return path === ADMIN_HOME_PATH || path.startsWith(`${ADMIN_HOME_PATH}/`);
}

export function adminNextPath(raw: unknown): string {
  const url = normalized(safeNextPath(raw));
  // 정규화한 값을 돌려준다 — 검사한 경로와 브라우저가 갈 경로가 같게
  return isAdminPagePath(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : ADMIN_HOME_PATH;
}
