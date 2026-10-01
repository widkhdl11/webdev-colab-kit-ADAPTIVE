import { describe, expect, it } from "vitest";
import { adminClient, payTestOrder, registerTestOrder } from "./helpers";

// 승인 서명 스펙(docs/specs/approval-signature.md) 중 DB 가 지키는 것.
// 서명 검증(INV-S2~S4)은 앱 서버가 approve_request 를 부르기 전에 한다 — 여기서는 그 뒤의 기록만 본다.

async function paidOrder() {
  const o = await registerTestOrder();
  const requestId = await payTestOrder(o);
  return { ...o, requestId };
}

describe("INV-S5: 한 요청 ID 는 한 번만 승인 처리된다", () => {
  it("INV-S5 S5: 같은 요청을 다시 승인하면 아무것도 바꾸지 않고 already 를 돌려준다", async () => {
    const o = await paidOrder();
    const first = await adminClient().rpc("approve_request", { p_request_id: o.requestId });
    expect(first.data).toBe("approved");
    const { data: before } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();

    const second = await adminClient().rpc("approve_request", { p_request_id: o.requestId });
    expect(second.data).toBe("already");
    const { data: after } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(after?.approved_at).toBe(before?.approved_at);
    const { data: approved } = await adminClient().from("approval_requests").select("id").eq("order_id", o.orderId).eq("status", "approved");
    expect(approved).toHaveLength(1);
  });

  it("INV-S5 S5b: 같은 요청이 동시에 두 번 와도 승인은 한 번이다", async () => {
    const o = await paidOrder();
    const results = await Promise.all([
      adminClient().rpc("approve_request", { p_request_id: o.requestId }),
      adminClient().rpc("approve_request", { p_request_id: o.requestId }),
    ]);
    expect(results.map((r) => r.data).sort()).toEqual(["already", "approved"]);
  });

  it("INV-S5: 한 주문에 승인된 요청은 DB 제약으로도 하나다", async () => {
    const o = await paidOrder();
    await adminClient().rpc("approve_request", { p_request_id: o.requestId });
    const { data: idx } = await adminClient().from("approval_requests").select("status").eq("order_id", o.orderId);
    expect(idx).toEqual([{ status: "approved" }]);
  });
});

describe("INV-S6: 승인할 수 없는 주문은 승인하지 않는다", () => {
  it("INV-S6 S6: 거절된 주문의 요청은 승인되지 않는다", async () => {
    const o = await paidOrder();
    expect((await adminClient().from("orders").update({ status: "rejected" }).eq("id", o.orderId)).error).toBeNull();
    const r = await adminClient().rpc("approve_request", { p_request_id: o.requestId });
    expect(r.data).toBe("not_approvable");
    const { data } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(data?.approved_at).toBeNull();
  });

  it("INV-S6: 없는 요청 ID 는 not_found", async () => {
    const r = await adminClient().rpc("approve_request", { p_request_id: "apr_NOSUCHREQUEST" });
    expect(r.data).toBe("not_found");
  });
});

describe("INV-S7: 승인 상태를 바꾸는 입구는 approve_request 하나다", () => {
  it("INV-S7 S7: 앱 서버 키로 주문의 승인 시각을 직접 고치면 DB 가 거부한다", async () => {
    const o = await paidOrder();
    const { error } = await adminClient().from("orders").update({ approved_at: new Date().toISOString() }).eq("id", o.orderId);
    expect(error?.code).toBe("42501");
    const { data } = await adminClient().from("orders").select("approved_at").eq("id", o.orderId).single();
    expect(data?.approved_at).toBeNull();
  });

  it("INV-S7: 앱 서버 키로 요청 상태를 approved 로 직접 고치면 DB 가 거부한다", async () => {
    const o = await paidOrder();
    const { error } = await adminClient()
      .from("approval_requests")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("request_id", o.requestId);
    expect(error?.code).toBe("42501");
  });

  it("INV-S7: 승인된 채로 주문을 새로 넣는 것도 거부한다", async () => {
    const { error } = await adminClient().from("orders").insert({
      order_no: "FC-TAPPRIN",
      fan_id: "00000000-0000-4000-a000-000000000001",
      creator_id: "00000000-0000-4000-b000-000000000001",
      item_kind: "시험 선물",
      has_electronics_or_metal: false,
      status: "registered",
      registered_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    });
    expect(error?.code).toBe("42501");
  });

  it("INV-S7: 승인이 아닌 상태 변경(거절)은 막지 않는다 — 막음이 승인에만 걸려 있는지", async () => {
    const o = await paidOrder();
    const { error } = await adminClient()
      .from("approval_requests")
      .update({ status: "declined", decided_at: new Date().toISOString() })
      .eq("request_id", o.requestId);
    expect(error).toBeNull();
  });
});
