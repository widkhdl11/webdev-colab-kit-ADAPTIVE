// 새 비밀번호 경계(signup INV-U6) — 8~72자, 영문·숫자·특수문자 중 3종류 이상, 아이디와 같을 수 없다. 가입(features/signup/model/signup-input.ts)·
// 재설정(session-login INV-L11)·바꾸기(INV-L12)가 이 숫자와 문구를 같이 쓴다 — 규칙과 문구는 여기 한 곳에만 있다.

export const PASSWORD_MIN = 8;
/** 섞어야 하는 종류 수 — 영문·숫자·특수문자(영문·숫자·공백이 아닌 글자) 가운데. KISA 안내의 「3종류 8자」 기준. */
export const PASSWORD_KINDS = 3;
export const PASSWORD_MAX = 72;

export const PASSWORD_TOO_SHORT = `비밀번호는 ${PASSWORD_MIN}자 이상으로 적어 주세요.`;
export const PASSWORD_TOO_LONG = `비밀번호는 ${PASSWORD_MAX}자까지 쓸 수 있어요.`;
export const PASSWORD_WEAK = "영문·숫자·특수문자를 모두 섞어 적어 주세요.";
// 화면 안내 줄 — 가운뎃점 덩어리는 \u2060 로 붙이고 「적어 주세요」는 줄이 안 바뀌는 띄어쓰기(design-rules 29절 줄바꿈 1·2)
export const PASSWORD_HINT = `${PASSWORD_MIN}자 이상, 영문\u2060·\u2060숫자\u2060·\u2060특수문자를 모두 섞고 아이디와 다르게 적어\u00a0주세요.`;
export const PASSWORD_SAME_AS_ID = "비밀번호를 아이디와 다르게 적어 주세요.";

/** 지금 비밀번호 확인이 틀렸을 때의 하나의 문구(INV-L5 와 같은 방식 — 무엇이 틀렸는지 더 알려 주지 않는다). 비밀번호 바꾸기·번호 바꾸기가 같이 쓴다. */
export const CURRENT_PASSWORD_WRONG = "지금 비밀번호가 맞지 않아요.";
export const CURRENT_PASSWORD_EMPTY = "지금 비밀번호를 적어 주세요.";

/** 영문·숫자·특수문자 가운데 몇 종류를 섞었는가. 한글 같은 글자는 특수문자 쪽으로 세고, 공백은 세지 않는다. */
export function passwordKinds(password: string): number {
  let kinds = 0;
  if (/[A-Za-z]/.test(password)) kinds += 1;
  if (/[0-9]/.test(password)) kinds += 1;
  if (/[^A-Za-z0-9\s]/.test(password)) kinds += 1;
  return kinds;
}

/** 문제가 없으면 null, 있으면 화면에 보일 문구. */
export function newPasswordProblem(password: string, loginId: string): string | null {
  if (password.length < PASSWORD_MIN) return PASSWORD_TOO_SHORT;
  if (password.length > PASSWORD_MAX) return PASSWORD_TOO_LONG;
  if (passwordKinds(password) < PASSWORD_KINDS) return PASSWORD_WEAK;
  if (password === loginId) return PASSWORD_SAME_AS_ID;
  return null;
}
