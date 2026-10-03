import { isRevgiftOrderNo } from "./revgift-order-no";

/** INV-R12: 팬에게 가는 알림에는 보낸 크리에이터 이름과 받기 링크만 들어간다. 주소는 넣을 자리가 없다. */
export function buildRevgiftNotice(input: { creatorName: string; orderNo: string }): { text: string; link: string } {
  if (!isRevgiftOrderNo(input.orderNo)) throw new Error("notice: 역조공 주문번호 형식이 아니다");
  return { text: `${input.creatorName}님이 선물을 보냈어요. 받을지 정해 주세요.`, link: `/me/revgifts/${input.orderNo}` };
}
