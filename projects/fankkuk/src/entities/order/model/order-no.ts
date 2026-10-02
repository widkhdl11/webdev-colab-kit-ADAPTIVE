// 주문번호: FC-7K3M9 (등록 건) 또는 FC-001-2 (상자 나눔). 대문자·숫자·하이픈만.
// 이 형식 밖의 문자가 들어올 자리가 없어야 서명 원문·QR 에 다른 정보가 섞이지 않는다.
export const ORDER_NO_PATTERN = /^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$/;

export function isOrderNo(value: string): boolean {
  return ORDER_NO_PATTERN.test(value);
}

// 새 등록 건의 번호: FC- + 다섯 자리. 헷갈리는 글자(I·O)는 뺀다. 겹치면 DB 유일 제약이 막고 등록이 새 번호로 다시 시도한다.
const NEW_ORDER_NO_ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newOrderNo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `FC-${Array.from(bytes, (b) => NEW_ORDER_NO_ALPHABET[b % NEW_ORDER_NO_ALPHABET.length]).join("")}`;
}
