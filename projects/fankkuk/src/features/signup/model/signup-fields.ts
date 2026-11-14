// 가입 화면 입력 칸의 모양 다듬기 — 판정이 아니라 입력 편의다(판정은 signup-input 의 스키마가 한다).
// 이메일: 「앞부분」 + @ + 고른 주소를 한 줄로 합쳐 서버에 보낸다(서버·DB 계약은 이메일 한 줄 그대로).
// 휴대폰: 입력하는 대로 하이픈을 넣는다. 서버로는 이 값 그대로 보내고, 스키마가 하이픈을 지운다.

/** 고를 수 있는 이메일 주소(@ 뒤). 순서 그대로 고르기 목록에 나온다. */
export const EMAIL_DOMAINS = ["naver.com", "gmail.com", "daum.net", "hanmail.net", "kakao.com", "nate.com"] as const;
/** 고르기 목록의 「직접 입력」 값 */
export const EMAIL_CUSTOM = "custom";

/** choice: EMAIL_DOMAINS 중 하나 · EMAIL_CUSTOM · ""(아직 고르지 않음). custom: 「직접 입력」 칸 */
export type EmailParts = { local: string; choice: string; custom: string };

const isListedDomain = (d: string): boolean => (EMAIL_DOMAINS as readonly string[]).includes(d);

export function joinEmail(p: EmailParts): string {
  const domain = p.choice === EMAIL_CUSTOM ? p.custom.trim() : p.choice;
  return `${p.local.trim()}@${domain}`;
}

/** 통째로 붙여 넣은 주소를 칸 셋으로 나눈다 — 목록에 있는 주소면 고르고, 없으면 「직접 입력」에 넣는다. */
export function splitEmail(full: string): EmailParts {
  const at = full.indexOf("@");
  const local = (at < 0 ? full : full.slice(0, at)).trim();
  const domain = at < 0 ? "" : full.slice(at + 1).trim();
  if (domain === "") return { local, choice: "", custom: "" };
  const lower = domain.toLowerCase();
  return isListedDomain(lower) ? { local, choice: lower, custom: "" } : { local, choice: EMAIL_CUSTOM, custom: domain };
}

/**
 * 앞부분 칸에 친 값 → 칸 셋. @ 가 들어오면 @ 뒤 글자를 주소 칸으로 옮긴다 — abc@gmail.com 을 끝까지 쳐도 앞부분이 abcgmail.com 이 되지 않게.
 * @ 뒤가 목록에 있는 주소면 그 항목을 고르고, 아니면(빈칸 포함) 「직접 입력」으로 바꿔 주소 칸으로 포커스를 옮긴다(focusCustom).
 */
export function emailLocalTyped(prev: EmailParts, value: string): { parts: EmailParts; focusCustom: boolean } {
  if (!value.includes("@")) return { parts: { ...prev, local: value }, focusCustom: false };
  const split = splitEmail(value);
  if (split.choice !== "" && split.choice !== EMAIL_CUSTOM) return { parts: split, focusCustom: false };
  return { parts: { local: split.local, choice: EMAIL_CUSTOM, custom: split.custom }, focusCustom: true };
}

// 휴대폰 번호 입력 함수는 shared/lib/phone/mobile-phone 으로 옮겼다 — 이 파일을 가져다 쓰던 곳을 위해 같은 이름으로 내보낸다
export { applyPhoneEdit, formatMobilePhone } from "@/shared/lib/phone/mobile-phone";
