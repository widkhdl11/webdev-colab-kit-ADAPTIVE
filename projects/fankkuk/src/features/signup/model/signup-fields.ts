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

const MOBILE_DIGITS = 11;

function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  // 자동 완성이 +82 10-… 꼴로 채우면 국내 번호로 돌린다
  if (d.startsWith("821")) d = `0${d.slice(2)}`;
  return d.slice(0, MOBILE_DIGITS);
}

function formatDigits(d: string): string {
  if (d.length <= 3) return d;
  // 010 은 언제나 11자리라 3-4-4. 011·016~019 는 10자리(3-3-4)일 수 있어 11자리가 되기 전까지 3-3-4
  const mid = d.startsWith("010") || d.length === MOBILE_DIGITS ? 4 : 3;
  if (d.length <= 3 + mid) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 3 + mid)}-${d.slice(3 + mid)}`;
}

/** 휴대폰 번호를 010-1234-5678 꼴로. 숫자 아닌 글자는 버리고 11자리에서 자른다. */
export function formatMobilePhone(raw: string): string {
  return formatDigits(phoneDigits(raw));
}

/** 서식을 붙인 값에서 숫자 n 개 바로 뒤의 자리 */
function caretAfterDigits(value: string, n: number): number {
  if (n <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/\d/.test(value.charAt(i))) seen += 1;
    if (seen === n) return i + 1;
  }
  return value.length;
}

/**
 * 휴대폰 칸이 바뀐 직후 — 서식을 다시 붙이고 커서를 같은 숫자 뒤에 둔다(하이픈이 생기거나 사라져도 튀지 않게).
 * 백스페이스·Delete 가 하이픈만 지웠으면 그 앞(뒤) 숫자를 지운다 — 안 그러면 서식이 하이픈을 되살려 지우기가 막힌다.
 * prev: 바뀌기 전 칸 값 · next: 브라우저가 바꾼 값 · caret: next 에서의 커서 · deleting: 지우는 방향(지우기가 아니면 null)
 */
export function applyPhoneEdit(
  prev: string,
  next: string,
  caret: number,
  deleting: "backward" | "forward" | null,
): { value: string; caret: number } {
  let digits = next.replace(/\D/g, "");
  let before = next.slice(0, caret).replace(/\D/g, "").length;
  const onlySeparatorRemoved = deleting !== null && next.length < prev.length && digits === prev.replace(/\D/g, "");
  if (onlySeparatorRemoved && deleting === "backward" && before > 0) {
    digits = digits.slice(0, before - 1) + digits.slice(before);
    before -= 1;
  } else if (onlySeparatorRemoved && deleting === "forward") {
    digits = digits.slice(0, before) + digits.slice(before + 1);
  }
  const value = formatMobilePhone(digits);
  const kept = phoneDigits(digits).length;
  return { value, caret: caretAfterDigits(value, Math.min(before, kept)) };
}
