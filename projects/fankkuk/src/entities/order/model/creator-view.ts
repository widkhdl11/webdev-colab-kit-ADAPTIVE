import type { OrderRecord } from "./order-record";
import { isApprovable } from "./order-status";

// 크리에이터 승인 요청 한 건. 원본 「팬이 보는 것 / 크리에이터가 보는 것」 표의 등록 단계:
// 팬 닉네임과 팬이 입력한 물품 종류. 팬의 송장번호·결제 정보는 넣지 않는다.
export type ApprovalRequestView = {
  orderNo: string;
  fanNickname: string;
  itemKind: string;
  boxCount: number;
  hasElectronicsOrMetal: boolean;
  registeredAt: string;
  receivedAt: string | null;
};

/**
 * 그 크리에이터의 승인 대기 주문. 오래 기다린 것부터. 승인할 수 없는 상태(INV-S6)는 빠진다.
 * 검수에서 반송된 주문도 빠진다 — 팬 화면이 이미 끝난 주문으로 보여 주므로 두 화면 판정을 맞춘다.
 * (반송을 승인 불가 상태로 둘지는 상태 전환 스펙에서 정한다 — BACKLOG)
 */
export function pendingApprovalRequests(records: readonly OrderRecord[], creatorId: string): ApprovalRequestView[] {
  return records
    .filter((r) => r.creatorId === creatorId && r.approvedAt === null && isApprovable(r.status) && r.inspection?.result !== "returned")
    .sort((a, b) => Date.parse(a.registeredAt) - Date.parse(b.registeredAt))
    .map((r) => ({
      orderNo: r.orderNo,
      fanNickname: r.fanNickname,
      itemKind: r.itemKind,
      boxCount: r.boxCount,
      hasElectronicsOrMetal: r.hasElectronicsOrMetal,
      registeredAt: r.registeredAt,
      receivedAt: r.receivedAt,
    }));
}
