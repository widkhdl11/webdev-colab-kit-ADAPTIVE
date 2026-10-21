import { describe, expect, it } from "vitest";
import { readShippingIssues } from "./shipping-issues";

// 운영자 「배송문제 확인」 (office-workflow INV-W10 S10f · INV-W7). 결제 + 7일이 지났고 미도착 상자가 있는 진행 중 주문 — 실명·주소·전화번호 칸은 없다.

type Reply = { data?: unknown; error: { code: string } | null };
function fakeClient(reply: Reply, operator = true) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: operator, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { client, calls };
}

const ROW = {
  order_no: "FC-7K3M9",
  sender_nickname: "별빛",
  paid_at: "2026-10-01T01:00:00+00:00",
  elapsed_days: 20,
  missing_boxes: 2,
  not_sent_at: "2026-10-15T03:00:00+00:00",
  auto_cancel_at: "2026-10-31T01:00:00+00:00",
};

describe("INV-W10 배송문제 확인 목록", () => {
  it("INV-W10 (S10f): 주문번호·보낸 사람·결제 시각·결제 후 경과일·미도착 상자 수·고객 답변·자동 취소일만 옮긴다", async () => {
    const f = fakeClient({ data: [ROW], error: null });
    expect(await readShippingIssues(f.client, { kind: "list" })).toEqual({
      status: 200,
      body: {
        issues: [
          { orderNo: "FC-7K3M9", senderNickname: "별빛", paidAt: ROW.paid_at, elapsedDays: 20, missingBoxes: 2, notSentAt: ROW.not_sent_at, autoCancelAt: ROW.auto_cancel_at },
        ],
      },
    });
    expect(f.calls).toEqual([{ fn: "admin_shipping_issues", args: undefined }]);
  });

  it("INV-W7 (실패경로): 정해진 칸 밖의 값(이름·주소·전화 꼴 칸)이 오면 내보내지 않고 500 · 운영자가 아니면 404 · 다른 칸이 든 요청은 400", async () => {
    for (const extra of [{ real_name: "김민지" }, { phone: "010-1234-5678" }, { address: "서울시" }]) {
      expect([extra, (await readShippingIssues(fakeClient({ data: [{ ...ROW, ...extra }], error: null }).client, { kind: "list" })).status]).toEqual([extra, 500]);
    }
    const no = fakeClient({ data: [ROW], error: null }, false);
    expect((await readShippingIssues(no.client, { kind: "list" })).status).toBe(404);
    expect(no.calls).toEqual([]);
    expect((await readShippingIssues(fakeClient({ data: [], error: null }).client, { kind: "list", orderNo: "FC-1" })).status).toBe(400);
  });
});
