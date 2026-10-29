import type { CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
import type { ReceivedProgress, SentProgress } from "./gift-progress";

// 선물 현황 줄의 「처리할 일」 버튼 (action-center INV-J11). 처리할 일 읽기(my_creator_action_items, INV-J5) 결과에서만 판정한다 —
// 현황이 따로 「손이 필요한가」를 세지 않는다. 받는 선물은 추적 장치 발견·블루투스·승인 요청 줄의 주문, 보내는 선물은 미확인 상자·반송 주소 줄의 몫.
// 판을 섞지 않는다(보낸 팬 선물 상자의 반송 주소 줄은 몫이 없어 현황 버튼이 되지 않는다).

export type ActionTargets = { received: ReadonlySet<string>; sent: ReadonlySet<string> };

export function actionTargetsOf(items: readonly CreatorActionItem[]): ActionTargets {
  const received = new Set<string>();
  const sent = new Set<string>();
  for (const it of items) {
    if (it.kind === "approval" || it.kind === "bluetooth" || it.kind === "tracker") received.add(it.orderNo);
    else if (it.kind === "unconfirmed") sent.add(it.shareId);
    else if (it.kind === "return_address" && it.shareId !== null) sent.add(it.shareId);
  }
  return { received, sent };
}

/** INV-J11: 그 줄의 주문(역조공은 몫)이 처리할 일 읽기 결과에 있을 때만 */
export function hasActionButton(row: ReceivedProgress | SentProgress, targets: ActionTargets): boolean {
  return row.board === "received" ? targets.received.has(row.orderNo) : targets.sent.has(row.shareId);
}
