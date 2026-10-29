// 국내 휴대폰 번호 꼴 — 숫자만(하이픈 없이), 01X 로 시작하는 10~11자리. DB 검사식과 같은 식이다.
export const MOBILE_PHONE_SHAPE = /^01[016789][0-9]{7,8}$/;

/** 입력한 번호에서 띄어쓰기·하이픈만 뗀다. 가입·번호 바꾸기·승인 서명 연결이 같은 정리를 쓴다. */
export function normalizeMobilePhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** 정리한 번호가 휴대폰 번호 꼴이면 그 숫자열, 아니면 null. */
export function mobilePhoneOf(raw: string): string | null {
  const phone = normalizeMobilePhone(raw);
  return MOBILE_PHONE_SHAPE.test(phone) ? phone : null;
}
