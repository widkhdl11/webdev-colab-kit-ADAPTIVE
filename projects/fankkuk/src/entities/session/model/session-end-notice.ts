// 로그인 유지 기간으로 끝나 로그인 화면에 왔을 때의 안내 (docs/specs/session-login.md INV-L17).
// 주소에는 누구에게나 같은 표시 하나(reason=session)만 싣는다 — 계정·역할·크리에이터 여부가 주소에 드러나지 않는다.
// 알림톡 안내 줄을 보일지는 서버(proxy)가 끝낼 때 남기는 짧은 HttpOnly 쿠키로만 정한다. 로그인 화면 요청에서 proxy 가 그 쿠키를 읽어
// 요청 머리(LOGIN_HINT_HEADER)로 화면에 넘기고 응답에서 지운다 — 브라우저가 보낸 같은 이름의 머리는 proxy 가 늘 지운다.
// 기간으로 끝낸 때만 reason 을 붙인다. 다른 이유로 이미 끝난 세션(비밀번호 바꾸기·직접 로그아웃)으로 온 요청에는 붙이지 않는다.

/** INV-L17: 로그인 화면 주소의 reason 값 — 기간으로 끝났다는 표시 하나 */
export const SESSION_END_REASON = "session";
export type SessionEndReason = typeof SESSION_END_REASON;

/** INV-L17: 알림톡 안내 줄 표시 쿠키(HttpOnly·SameSite=Lax·운영 Secure·Path=/login) */
export const LOGIN_HINT_COOKIE = "fk_login_hint";
export const LOGIN_HINT_LINK = "link";
export const LOGIN_HINT_MAX_AGE_SECONDS = 10 * 60;
/** proxy 가 로그인 화면 요청에 실어 넘기는 머리 — 화면(서버)만 읽는다 */
export const LOGIN_HINT_HEADER = "x-fk-login-hint";

/** INV-L17: 미사용·절대 어느 쪽으로 끝났든 같은 문구 */
export const SESSION_END_MESSAGE = "보안을 위해 다시 로그인해 주세요.";
/** INV-L17: 끝난 사람이 크리에이터이고 승인 요청 로그인 링크 템플릿이 등록돼 있을 때만 한 줄 더 */
export const SESSION_END_LINK_HINT = "승인 요청 알림톡의 [승인 화면 열기]를 누르면 바로 로그인됩니다.";

/** 로그인 화면 주소의 reason 값 + 안내 줄 표시 → 보일 안내(없으면 null). 두 문장은 화면이 문장마다 줄을 나눈다. */
export function sessionEndNoticeOf(reason: unknown, linkHint: boolean): string | null {
  if (reason !== SESSION_END_REASON) return null;
  return linkHint ? `${SESSION_END_MESSAGE} ${SESSION_END_LINK_HINT}` : SESSION_END_MESSAGE;
}
