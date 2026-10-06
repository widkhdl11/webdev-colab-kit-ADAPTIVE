// 새 비밀번호 경계(signup INV-U6) — 10~72자, 아이디와 같을 수 없다. 가입(features/signup/model/signup-input.ts)·
// 재설정(session-login INV-L11)·바꾸기(INV-L12)가 이 숫자와 문구를 같이 쓴다 — 규칙과 문구는 여기 한 곳에만 있다.

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;

export const PASSWORD_TOO_SHORT = `비밀번호는 ${PASSWORD_MIN}자 이상으로 적어 주세요.`;
export const PASSWORD_TOO_LONG = `비밀번호는 ${PASSWORD_MAX}자까지 쓸 수 있어요.`;
export const PASSWORD_SAME_AS_ID = "비밀번호를 아이디와 다르게 적어 주세요.";

/** 지금 비밀번호 확인이 틀렸을 때의 하나의 문구(INV-L5 와 같은 방식 — 무엇이 틀렸는지 더 알려 주지 않는다). 비밀번호 바꾸기·번호 바꾸기가 같이 쓴다. */
export const CURRENT_PASSWORD_WRONG = "지금 비밀번호가 맞지 않아요.";
export const CURRENT_PASSWORD_EMPTY = "지금 비밀번호를 적어 주세요.";

/** 문제가 없으면 null, 있으면 화면에 보일 문구. */
export function newPasswordProblem(password: string, loginId: string): string | null {
  if (password.length < PASSWORD_MIN) return PASSWORD_TOO_SHORT;
  if (password.length > PASSWORD_MAX) return PASSWORD_TOO_LONG;
  if (password === loginId) return PASSWORD_SAME_AS_ID;
  return null;
}
