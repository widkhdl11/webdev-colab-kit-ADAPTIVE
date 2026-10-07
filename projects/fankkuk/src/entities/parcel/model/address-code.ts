// 상자별 받는 주소 6자리 (inbound-address-code INV-C1·C5). 화면에서는 「코드」라고 부르지 않고 「이 선물의 받는 주소」로 부른다.
// 글자는 20자만 쓴다 — 0·O·1·I·L·5·S·8·B·2·Z·U·V·G·6·Q 처럼 서로 헷갈리는 글자를 뺐다.
// 앞 5자리는 DB 가 무작위로 뽑고, 마지막 1자리는 앞 5자리로 계산한 확인 문자다. 계산은 Damm 방식 —
// 글자 순번 i(0~19)를 짝 (a, b) = (i 를 5로 나눈 몫 0~3, 나머지 0~4)로 보고, 처음 값 (0, 0) 에 한 글자씩
//   (a1, b1) * (a2, b2) = (ALPHA_TIMES[a1] XOR a2, (2·b1 + b2) mod 5)
// 로 접는다. 6자리를 다 접은 결과가 (0, 0) 이면 맞다. 이 접기 규칙은 「한 글자만 다르면 결과가 다르다」와
// 「이웃 두 글자를 바꾸면 결과가 다르다」를 모든 경우에 만족한다 — 그래서 한 글자 틀림·이웃 두 글자 바뀜을
// 예외 없이 잡고, 앞 5자리는 그대로 20⁵ 가지다.
// DB 의 public.inbound_code_check_char 가 같은 계산을 SQL 로 가진다 — 통합 시험이 두 구현의 답을 대조한다.

export const ADDRESS_CODE_ALPHABET = "3479ACDEFHJKMNPRTWXY";

export const ADDRESS_CODE_PATTERN = /^[3479ACDEFHJKMNPRTWXY]{6}$/;

// 네 가지 쪽: 원소 넷인 유한체에서 0·1 이 아닌 원소 α 를 곱하는 표 — 0→0, 1→α(2), α→α+1(3), α+1→1
const ALPHA_TIMES = [0, 2, 3, 1];

function fold(state: number, x: number): number {
  const a = ALPHA_TIMES[Math.floor(state / 5)] ^ Math.floor(x / 5);
  const b = (2 * (state % 5) + (x % 5)) % 5;
  return a * 5 + b;
}

/** 앞 5자리(20자 안의 글자)로 확인 문자를 계산한다. 20자 밖의 글자가 있으면 던진다. */
export function addressCodeCheckChar(body: string): string {
  if (!/^[3479ACDEFHJKMNPRTWXY]{5}$/.test(body)) throw new Error("확인 문자를 계산할 앞 5자리 꼴이 아니다");
  let state = 0;
  for (const ch of body) state = fold(state, ADDRESS_CODE_ALPHABET.indexOf(ch));
  // fold(state, x) 가 (0, 0) 이 되는 x — a 쪽은 ALPHA_TIMES[a1] 와 같은 값, b 쪽은 2·b1 을 0 으로 되돌리는 값
  const a = ALPHA_TIMES[Math.floor(state / 5)];
  const b = (5 - ((2 * (state % 5)) % 5)) % 5;
  return ADDRESS_CODE_ALPHABET[a * 5 + b];
}

export type AddressCodeInput =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "format" | "check" };

/**
 * 직원·팬이 넣은 6자리를 정리하고 검사한다(서버 쪽 — DB 도 같은 검사를 한다).
 * 대소문자는 가리지 않고 대문자로 바꾼다. 앞뒤 공백만 지운다. 20자 밖의 글자가 있으면 확인 문자를 보기 전에 꼴 오류다.
 */
export function parseAddressCode(input: string): AddressCodeInput {
  const value = input.trim().toUpperCase();
  if (value === "") return { ok: false, reason: "empty" };
  if (!ADDRESS_CODE_PATTERN.test(value)) return { ok: false, reason: "format" };
  if (addressCodeCheckChar(value.slice(0, 5)) !== value[5]) return { ok: false, reason: "check" };
  return { ok: true, value };
}
