// 크리에이터의 승인 취소 (approval-cancel INV-AC1·AC2·AC4).
// 화면이 「승인 취소」 버튼과 확인 창 문구를 정하는 값 — 모두 서버(DB 읽기 함수)가 정한다. 저장할 때는 취소 함수가 다시 판정한다.

/** before_inbound = 상자가 하나도 도착하지 않아 승인 대기로 돌아감 / after_inbound = 도착한 상자가 있어 거절로 끝남 (INV-AC1) */
export type ApprovalCancelPhase = "before_inbound" | "after_inbound";

export type ApprovalCancelTarget = {
  requestId: string;
  orderNo: string;
  /** 승인됨 · 첫 송장 출력 전 · 진행 중(INV-AC4). 거짓이면 버튼을 보이지 않는다 */
  cancelable: boolean;
  /** 지금 팬꾹에 도착한 상자 수 — 0 이면 입고 전(대기로 되돌림), 1 이상이면 입고 뒤(거절로 끝남) */
  arrivedBoxCount: number;
  boxCount: number;
  /** 승인 기한(결제 완료부터, INV-S6) — 취소해도 늘지 않는다(INV-AC2) */
  approvalDeadlineAt: string;
};

/** 확인 창이 보여 줄 결과 — 입고 전이고 기한 안이면 다시 승인할 수 있다, 기한이 지났으면 자동 반려된다, 입고 뒤면 거절로 끝난다 */
export type ApprovalCancelPreview = "back_to_waiting" | "back_to_waiting_expired" | "ends_declined";

export function previewApprovalCancel(t: Pick<ApprovalCancelTarget, "arrivedBoxCount" | "approvalDeadlineAt">, now: Date): ApprovalCancelPreview {
  if (t.arrivedBoxCount > 0) return "ends_declined";
  return now.getTime() >= new Date(t.approvalDeadlineAt).getTime() ? "back_to_waiting_expired" : "back_to_waiting";
}
