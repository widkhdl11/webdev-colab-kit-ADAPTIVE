// 역조공 몫의 주문번호: RG- + 여섯 자리. 팬 선물 번호(FC-)와 섞이지 않는다.
// 대문자·숫자만 — 알림 링크·QR 에 다른 정보가 섞일 자리가 없다.
export const REVGIFT_ORDER_NO_PATTERN = /^RG-[0-9A-Z]{3,12}$/;

export function isRevgiftOrderNo(value: string): boolean {
  return REVGIFT_ORDER_NO_PATTERN.test(value);
}

// 헷갈리는 글자(I·O)는 뺀다. 겹치면 DB 유일 제약이 막고 등록이 새 번호로 다시 시도한다.
const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function newRevgiftOrderNo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `RG-${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}

/** INV-R12: 내부 QR 에는 몫 주문번호만 들어간다. */
export function revgiftQrContent(orderNo: string): string {
  if (!isRevgiftOrderNo(orderNo)) throw new Error("qr: 역조공 주문번호 형식이 아니다");
  return orderNo;
}
