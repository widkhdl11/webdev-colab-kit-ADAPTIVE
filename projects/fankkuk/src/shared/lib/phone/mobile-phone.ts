// 휴대폰 번호 입력 — 칠 때 「-」를 자동으로 넣고 커서를 맞춘다. 회원가입(features/signup)에서 옮겼다(2026-11-14 —
// 주소 입력 칸(shared/ui/sealed-address-form)에서도 「회원가입할 때처럼」 쓰려고. shared 는 features 를 가져올 수 없어서 아래 층으로 내렸다).
const MOBILE_DIGITS = 11;
const INTL_PREFIX = "+82";

const isIntl = (raw: string): boolean => raw.trimStart().startsWith(INTL_PREFIX);

/** 국내 번호의 숫자만. 맨 앞이 +82 일 때만 국제번호로 보고 0 으로 바꾼다(+82 010… 꼴은 0 을 겹치지 않는다). 숫자 821… 은 그대로 */
function domesticDigits(raw: string): string {
  if (!isIntl(raw)) return raw.replace(/\D/g, "");
  const rest = raw.trimStart().slice(INTL_PREFIX.length).replace(/\D/g, "");
  return rest === "" || rest.startsWith("0") ? rest : `0${rest}`;
}

function phoneDigits(raw: string): string {
  return domesticDigits(raw).slice(0, MOBILE_DIGITS);
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
  let digits = domesticDigits(next);
  // 커서 앞 숫자 수도 국내 번호 기준으로 센다(+82 를 0 으로 바꾼 만큼 옮긴다)
  let before = isIntl(next) ? domesticDigits(next.slice(0, caret)).length : next.slice(0, caret).replace(/\D/g, "").length;
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
