import { isOrderNo } from "./order-no";

/** INV-P10: 내부 QR 에는 주문번호 문자열만 들어간다. 주소·이름·URL 은 넣을 자리가 없다. */
export function qrContentFor(orderNo: string): string {
  if (!isOrderNo(orderNo)) throw new Error("qr: 주문번호 형식이 아니다");
  return orderNo;
}
