import type { OrderStatus } from "./order-status";

// 주문 한 건의 저장 모양 — fan-view·creator-view 시험과 변환 함수가 입력으로 쓴다.
// 팬·크리에이터 화면은 이 기록을 그대로 받지 않는다 — fan-view / creator-view 가 보여 줄 칸만 골라낸다.
export type OrderRecord = {
  orderNo: string;
  creatorId: string;
  creatorName: string;
  fanNickname: string;
  itemKind: string;
  boxCount: number;
  hasElectronicsOrMetal: boolean;
  status: OrderStatus;
  registeredAt: string; // ISO 시각
  approvedAt: string | null;
  receivedAt: string | null;
  // checking = 확인 중 — 추적기 보관·신고 보관·경찰 인계 상자가 있는 주문(office-workflow INV-W14). 통과·반송 어느 쪽으로도 세지 않는다
  inspection: { result: "passed" | "returned" | "checking"; at: string } | null;
  shippedAt: string | null;
  expectedArrivalDate: string | null; // YYYY-MM-DD
  delivery: "in_transit" | "delivered" | null; // 택배사 조회 결과 — 단계만
  outboundWaybillNo: string | null; // 크리에이터에게 보내는 송장. 팬에게는 보여주지 않는다
  fanTrackingNo: string | null; // 팬이 사무실로 보낸 택배의 송장번호
  fanSendAckAt: string | null; // 승인 전에 팬이 「먼저 보내기」를 누른 시각(approval-signature INV-S9)
};
