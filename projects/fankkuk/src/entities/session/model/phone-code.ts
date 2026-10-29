// 휴대폰 인증번호 규칙(signup INV-U10·U15) — 화면(남은 시간·만료 안내)과 서버(인증번호 확인)가 같이 쓴다.
// 이 파일은 node:crypto 를 쓰지 않는다 — 브라우저 묶음에 들어가도 된다. 인증번호 만들기·해시는 shared/api/phone-verifier(서버 전용).

/** 인증번호 자릿수 */
export const PHONE_CODE_LENGTH = 6;
/** 인증번호를 맞힐 수 있는 시간(초) — 판정은 DB 가 한다(보낸 때 + 3분). 화면은 남은 시간 표시에만 쓴다 */
export const PHONE_CODE_TTL_SECONDS = 180;
/** 인증번호 하나에 허용하는 틀린 입력 */
export const PHONE_CODE_MAX_WRONG = 5;
/** 3분이 지났을 때 — 화면이 먼저 띄우고, 서버도 같은 문구로 답한다 */
export const PHONE_CODE_EXPIRED_MESSAGE = "인증 시간이 지났습니다. 인증번호를 다시 받아 주세요.";

/** 인증번호가 실제로 간 길(INV-U15) — 서버 응답의 channel */
export type PhoneCodeChannel = "kakao" | "sms";

/** 응답의 channel 읽기. 「kakao」라고 확인된 때만 카카오톡이다 — 그 밖에는 문자 쪽 문구(둘 다 갔을 때와 같은 쪽)를 쓴다. */
export function readPhoneCodeChannel(value: unknown): PhoneCodeChannel {
  return value === "kakao" ? "kakao" : "sms";
}

/** 받기 성공 안내 — 실제로 간 길대로(INV-U15, UX 명세 signup step 3 sent). 가입·번호 바꾸기가 같이 쓴다 */
export const PHONE_CODE_SENT_MESSAGE: Record<PhoneCodeChannel, string> = {
  kakao: "카카오톡으로 인증번호를 보냈어요",
  sms: "문자로 인증번호를 보냈어요",
};
