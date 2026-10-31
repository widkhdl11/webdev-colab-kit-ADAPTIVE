import { createHash, randomBytes } from "node:crypto";

// 알림톡 로그인 링크의 1회용 토큰 (docs/specs/link-login.md INV-K1·K4·K5).
// 토큰 원문은 알림톡 버튼 주소에만 있다. DB 에는 SHA-256 해시만 가고(INV-K1), 로그에는 해시 앞 8자만 쓴다(INV-K5).
// 서버 전용 — 토큰을 만들고 해시하는 일은 발송 일꾼·토큰 쓰기 라우트만 한다.

/** INV-K1: 추측할 수 없는 무작위 32바이트 */
export const LOGIN_LINK_TOKEN_BYTES = 32;
/** 32바이트의 base64url(채움 없음)은 43자 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** 로그인 링크 페이지의 경로 — 알림톡 버튼 주소는 `https://fankkuk.com/login/link#t=<토큰>` (템플릿 문서 10절). # 뒤라 서버 요청 기록에 남지 않는다(INV-K1) */
export const LOGIN_LINK_PATH = "/login/link";

export function loginLinkTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** INV-K1: 새 토큰과 그 해시. 원문은 부른 쪽이 알림톡 변수로만 넘긴다. */
export function newLoginLinkToken(): { token: string; hash: string } {
  const token = randomBytes(LOGIN_LINK_TOKEN_BYTES).toString("base64url");
  return { token, hash: loginLinkTokenHash(token) };
}

/** 요청 본문의 토큰 — 꼴이 아니면 null(DB 에 묻지 않는다). */
export function readLoginLinkToken(raw: unknown): string | null {
  return typeof raw === "string" && TOKEN_PATTERN.test(raw) ? raw : null;
}

/** INV-K5: 서버 로그·실패 기록에 쓰는 것은 해시 앞 8자뿐 */
export function loginLinkHashPrefix(hash: string): string {
  return hash.slice(0, 8);
}

/** INV-K4: 토큰을 쓰면 승인 대기 목록(처리할 일)으로 — entities 끼리 가져오지 않아 값으로 둔다. 처리할 일 경로와 같은지는 link-sign-in 시험이 본다 */
export const LINK_LOGIN_SUCCESS_PATH = "/creator/actions";

/** 로그인 화면 주소의 표시 값 — 이 값일 때만 아래 문구를 보인다 */
const LINK_EXPIRED_FLAG = "expired";

/** INV-K4: 실패(없음·이미 씀·만료)는 로그인 화면으로. 로그인 뒤 돌아갈 곳은 승인 대기 목록(INV-L13). */
export const LINK_LOGIN_FAILED_PATH = `/login?next=${encodeURIComponent(LINK_LOGIN_SUCCESS_PATH)}&link=${LINK_EXPIRED_FLAG}`;

/** INV-K4(카드 d1): 다른 계정으로 로그인해 있어 로그아웃했을 때 — 안내 문구 없는 로그인 화면, 돌아갈 곳은 승인 대기 목록 */
export const LINK_LOGIN_SIGNED_OUT_PATH = `/login?next=${encodeURIComponent(LINK_LOGIN_SUCCESS_PATH)}`;

/** INV-K4: 실패 사유를 나누지 않는 문구 하나 */
export const LINK_LOGIN_EXPIRED_MESSAGE = "로그인 링크가 만료됐습니다.";

/** 로그인 화면 주소의 link 값 → 보일 안내(없으면 null). */
export function loginNoticeOf(raw: unknown): string | null {
  return raw === LINK_EXPIRED_FLAG ? LINK_LOGIN_EXPIRED_MESSAGE : null;
}
