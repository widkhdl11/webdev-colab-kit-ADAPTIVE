import { hasArrived, type GiftBox } from "@/entities/parcel/model/box-rows";

// 선물 상세에 「취소하기」를 그릴지 (payment INV-M16). 위젯은 이 결과를 그리기만 한다.
// 진행 중 주문이고 상자 줄이 있고 그중 사무실에 도착한 상자가 하나도 없을 때만. 최종 판정(결제 완료·잠근 뒤 입고 없음)은 DB 가 한다.

export function canCancelGift(boxes: readonly GiftBox[], inProgress: boolean): boolean {
  return inProgress && boxes.length > 0 && boxes.every((b) => !hasArrived(b.state));
}
