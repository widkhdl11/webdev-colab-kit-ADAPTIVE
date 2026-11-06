// 휴대폰 비밀번호 찾기(/password/forgot) 문장 — 서버(phone-reset.ts·reset-password.ts)와 화면(phone-reset-form.tsx)이 같이 쓴다.
// 문장의 정본은 UX 명세 docs/ux/pages/password-forgot.md 상태표다(session-login INV-L10·L11).

/** INV-L10: 받기 응답은 가입 여부·운영자 번호·한도와 상관없이 이 문장 하나다 */
export const RESET_CODE_SENT_MESSAGE = "인증번호를 보냈습니다. 받지 못하셨다면 번호를 확인해 주세요.";
/** 인증번호는 맞았지만 표를 발급하지 못함(확인 10분 지남·계정 없음) · 번호표 쿠키 없음 — 가입 3단계와 같은 문장 */
export const RESET_CODE_AGAIN = "인증번호를 다시 받아 주세요.";
/** INV-L11: 재설정 표가 없거나 10분 지남·이미 씀·새 표로 무효 */
export const RESET_TICKET_EXPIRED = "확인 시간이 지났습니다. 인증번호를 다시 받아 주세요.";
/** 표는 썼지만 비밀번호 바꾸기가 실패 — 표가 이미 쓰였으므로 처음부터 */
export const RESET_SAVE_FAILED = "비밀번호를 바꾸지 못했습니다. 인증번호를 다시 받아 주세요.";
/** 문자 창구가 없음(운영 설정 누락) — 다시 해도 풀리지 않으므로 고객센터로 */
export const RESET_CLOSED = "지금은 비밀번호 찾기를 이용할 수 없습니다. 고객센터로 문의해 주세요.";
