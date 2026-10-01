import type { OrderStatus } from "./order-status";

// 주문 한 건의 저장 모양. DB 전에는 예시 데이터(api/sample-orders)가 이 모양을 따른다.
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
  inspection: { result: "passed" | "returned"; at: string } | null;
  shippedAt: string | null;
  expectedArrivalDate: string | null; // YYYY-MM-DD
  delivery: "in_transit" | "delivered" | null; // 택배사 조회 결과 — 단계만
  outboundWaybillNo: string | null; // 크리에이터에게 보내는 송장. 팬에게는 보여주지 않는다
  fanTrackingNo: string | null; // 팬이 사무실로 보낸 택배의 송장번호
};
