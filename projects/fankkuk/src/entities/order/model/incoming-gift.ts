// 크리에이터가 받은 선물 한 건의 진행 단계 (office-workflow INV-W9). DB 읽기 함수 my_incoming_gifts 가 돌려주는 칸만 있다 —
// 실명·주소·전화, 보낸 사람 계정, 원 송장번호, 출고 송장번호, 처리한 운영자는 이 모양에 없다.

/** paid 결제 완료(입고 전) · received 입고 · inspected 검수 완료 · shipped 출고 · in_transit 배송중 · delivered 수령
 *  · returned 검수에서 반송 · closed 거절·7일 반려·취소 */
export type IncomingStage = "paid" | "received" | "inspected" | "shipped" | "in_transit" | "delivered" | "returned" | "closed";

export type IncomingInspection = "passed" | "held" | "returned";

export type IncomingGiftView = {
  orderNo: string;
  senderNickname: string;
  boxCount: number;
  stage: IncomingStage;
  paidAt: string;
  receivedAt: string | null;
  inspectedAt: string | null;
  shippedAt: string | null;
  inspection: IncomingInspection | null;
  delivery: "in_transit" | "delivered" | null;
};

/** 크리에이터 메인 「진행 중인 선물」에 나오는 단계 — 수령했거나 반송·거절로 끝난 선물은 빠진다. */
export function isIncomingInProgress(g: Pick<IncomingGiftView, "stage">): boolean {
  return g.stage !== "delivered" && g.stage !== "returned" && g.stage !== "closed";
}

const STAGE_NOTE: Partial<Record<IncomingStage, string>> = {
  paid: "사무실 도착을 기다려요.",
  received: "사무실에 도착했어요. 검수를 기다려요.",
  inspected: "검수를 마쳤어요.",
  shipped: "출고했어요.",
  in_transit: "지금 가고 있어요.",
};

/**
 * 크리에이터 메인 「진행 중인 선물」 한 줄의 지금 상황. 단계 문구가 먼저다.
 * 보관(추적 장치) 상자가 있어도 다른 상자는 단계를 따라 계속 가므로, 보관 문구는 단계가 입고(received)일 때만 대신 쓰고
 * 그 밖의 단계에서는 단계 문구 뒤에 「상자 일부 보관」을 붙인다.
 */
export function incomingNoteOf(g: Pick<IncomingGiftView, "stage" | "inspection">): string {
  const held = g.inspection === "held";
  if (held && g.stage === "received") return "추적 장치가 나와 사무실에 보관하고 있어요.";
  const note = STAGE_NOTE[g.stage] ?? "";
  return held ? `${note} 상자 일부 보관`.trim() : note;
}
