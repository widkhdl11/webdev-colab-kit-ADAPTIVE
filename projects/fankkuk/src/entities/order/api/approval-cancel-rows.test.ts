import { describe, expect, it } from "vitest";
import { previewApprovalCancel } from "../model/approval-cancel";
import { parseApprovalCancelTargets, readApprovalCancelTargets } from "./approval-cancel-rows";

const raw = {
  request_id: "apr_FCTABC123",
  order_no: "FC-TABC123",
  cancelable: true,
  arrived_box_count: 0,
  approval_deadline_at: "2026-11-09T03:00:00+00:00",
};

describe("승인 취소 화면 값 (approval-cancel)", () => {
  it("INV-AC1·AC4: 취소 가능·도착한 상자 수·상자 수·승인 기한을 그대로 옮긴다", () => {
    expect(parseApprovalCancelTargets([raw])).toEqual([
      { requestId: "apr_FCTABC123", orderNo: "FC-TABC123", cancelable: true, arrivedBoxCount: 0, approvalDeadlineAt: "2026-11-09T03:00:00.000Z" },
    ]);
  });

  it("꼴이 다르면 던진다 — 빠진 칸·음수 상자 수·요청 ID 꼴", () => {
    const { cancelable: _c, ...noCancelable } = raw;
    for (const bad of [noCancelable, { ...raw, arrived_box_count: -1 }, { ...raw, request_id: "FC-TABC123" }]) {
      expect(() => parseApprovalCancelTargets([bad])).toThrow();
    }
  });

  it("INV-AC5: 세션에서 확인한 사람 ID 만 넘긴다", async () => {
    const calls: unknown[] = [];
    const admin = { rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), { data: [raw], error: null }) } as never;
    await readApprovalCancelTargets(admin, "00000000-0000-4000-a000-000000000011");
    expect(calls).toEqual([{ fn: "my_approval_cancel_targets", args: { p_actor_id: "00000000-0000-4000-a000-000000000011" } }]);
  });

  it("INV-AC1·AC2: 확인 창 결과 — 도착한 상자가 있으면 거절로 끝남, 없으면 대기로(기한이 지났으면 다시 승인할 수 없음)", () => {
    const deadline = "2026-11-09T03:00:00.000Z";
    expect(previewApprovalCancel({ arrivedBoxCount: 1, approvalDeadlineAt: deadline }, new Date("2026-11-02T00:00:00Z"))).toBe("ends_declined");
    expect(previewApprovalCancel({ arrivedBoxCount: 0, approvalDeadlineAt: deadline }, new Date("2026-11-09T02:59:59Z"))).toBe("back_to_waiting");
    expect(previewApprovalCancel({ arrivedBoxCount: 0, approvalDeadlineAt: deadline }, new Date(deadline))).toBe("back_to_waiting_expired");
  });
});
