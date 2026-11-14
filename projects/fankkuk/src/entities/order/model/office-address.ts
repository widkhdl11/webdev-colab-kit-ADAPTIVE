// 팬꾹 주소(팬이 상자를 보내는 사무실 주소, 6자리를 붙이기 전) 값 검사 (admin-console INV-K19 ②).
// DB 쓰기 함수(office_address_wellformed)가 같은 검사를 최종으로 한다. 앱은 먼저 걸러 DB 까지 보내지 않는다.

export const OFFICE_ADDRESS_MIN = 5;
export const OFFICE_ADDRESS_MAX = 120;

export type OfficeAddressProblem = "length" | "control";

/** 앞뒤 공백을 뺀 값 — 저장·검사는 이 값으로 한다 */
export function normalizeOfficeAddress(raw: string): string {
  return raw.trim();
}

// 제어 문자 = C0·DEL·C1 + 눈에 안 보이는 줄 구분·방향 제어·폭 없는 문자. DB office_address_wellformed 와 같은 범위다 —
// 화면에 보이는 주소와 복사되는 주소가 달라지지 않게 한다.
// eslint-disable-next-line no-control-regex -- 제어 문자를 찾는 것이 목적이다
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/;

/** 문제가 없으면 null. 글자 수는 앞뒤 공백을 뺀 값으로 센다(코드 포인트 기준, DB char_length 와 같다). */
export function officeAddressProblem(raw: string): OfficeAddressProblem | null {
  const v = normalizeOfficeAddress(raw);
  if (INVISIBLE.test(v)) return "control";
  const n = [...v].length;
  if (n < OFFICE_ADDRESS_MIN || n > OFFICE_ADDRESS_MAX) return "length";
  return null;
}
