// 새 비밀번호 화면의 링크 오류 문장 — 서버(reset-password.ts)와 화면(reset-password-panel.tsx)이 같이 쓴다.
// 재설정 메일은 「비밀번호 찾기」(/password/forgot, 용어집 7절)에서 다시 받는다(design-rules 29절 · 시안 part6 password-reset.html).
// 「재설정 메일」·「받아 주세요」는 줄이 안 바뀌는 띄어쓰기(29절 줄바꿈 2). 화면 이름은 화면에서 .nw 로 묶는다(FORGOT_SCREEN_NAME).

export const FORGOT_PATH = "/password/forgot";
export const FORGOT_SCREEN_NAME = "비밀번호 찾기";

const GET_NEW_MAIL = `${FORGOT_SCREEN_NAME}에서 재설정\u00a0메일을 다시 받아\u00a0주세요.`;

/** 주소에 링크 값이 없을 때 */
export const RESET_NO_TOKEN = `링크가 올바르지 않아요. ${GET_NEW_MAIL}`;
/** 링크 꼴이 틀림·만료·이미 씀·다른 요청으로 무효(session-login INV-L11) */
export const RESET_LINK_INVALID = `이 링크는 쓸\u00a0수\u00a0없어요. ${GET_NEW_MAIL}`;
/** 링크는 썼지만 비밀번호 바꾸기가 실패 */
export const RESET_SAVE_FAILED = `비밀번호를 바꾸지 못했어요. ${GET_NEW_MAIL}`;
