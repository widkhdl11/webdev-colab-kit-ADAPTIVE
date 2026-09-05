// 슬라이스의 공개 API. 라우팅 상수(PROTECTED_PATHS · LOGIN_PATH 등)는 일부러 빼 뒀다 —
// 내보내면 앱의 URL 상수가 세션 슬라이스에 눌러앉는다.
export { decideRouteAccess, type RouteAccess } from "./model/route-access";
export { readVerifiedUser, type VerifiedUser } from "./model/verified-user";
export { NO_SESSION_MESSAGE, requireSession } from "./model/require-session";
export { currentUser } from "./api/current-user";
