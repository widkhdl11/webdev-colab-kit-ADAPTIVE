import type { OrderRecord } from "./order-record";
import { isApprovable } from "./order-status";
import type { PriorGiftHistory } from "./prior-history";

// 크리에이터 승인 요청 한 건. 원본 「팬이 보는 것 / 크리에이터가 보는 것」 표의 등록 단계:
// 팬 닉네임과 팬이 입력한 물품 종류. 팬의 송장번호·결제 정보는 넣지 않는다.
export type ApprovalRequestView = {
  /** 승인 요청 식별값 — 거절할 때 이것 하나만 서버로 보낸다(decline-block INV-D1). 보낸 사람 계정 값은 화면에 오지 않는다. */
  requestId: string;
  orderNo: string;
  fanNickname: string;
  itemKind: string;
  boxCount: number;
  hasElectronicsOrMetal: boolean;
  registeredAt: string;
  receivedAt: string | null;
  /** 이 팬이 이 크리에이터에게 보낸 지난 주문의 검수 내역(decline-block INV-D11). 다른 크리에이터에게 보낸 주문은 세지 않는다. */
  priorHistory: PriorGiftHistory;
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
      // 예시 기록에는 요청 식별값이 없다 — 시드와 같은 꼴(apr_ + 하이픈 뺀 주문번호)로 만든다
      requestId: `apr_${r.orderNo.replaceAll("-", "")}`,
      orderNo: r.orderNo,
      fanNickname: r.fanNickname,
      itemKind: r.itemKind,
      boxCount: r.boxCount,
      hasElectronicsOrMetal: r.hasElectronicsOrMetal,
      registeredAt: r.registeredAt,
      receivedAt: r.receivedAt,
      priorHistory: priorHistoryOf(records, r),
    }));
}

// 예시 기록에는 보낸 사람 계정 값이 없어 닉네임으로 같은 팬을 가른다(예시 전용 — DB 는 계정으로 센다, INV-D6·D11).
function priorHistoryOf(records: readonly OrderRecord[], current: OrderRecord): PriorGiftHistory {
  const prior = records.filter(
    (o) => o.creatorId === current.creatorId && o.fanNickname === current.fanNickname && o.orderNo !== current.orderNo,
  );
  return {
    gifts: prior.length,
    passed: prior.filter((o) => o.inspection?.result === "passed").length,
    returned: prior.filter((o) => o.inspection?.result === "returned").length,
  };
}
