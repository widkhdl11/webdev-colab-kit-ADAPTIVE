import { describe, expect, it } from "vitest";
import { adminClient, payTestOrder, registerTestOrder, requestIdFor } from "./helpers";

// 결제 스펙(docs/specs/payment.md) 중 DB 가 지키는 것.

describe("INV-M6: 결제 완료 전에는 승인 요청을 만들지 않는다", () => {
  it("INV-M6 S6: 결제 대기 주문에 승인 요청을 넣으면 DB 가 거부한다", async () => {
    const o = await registerTestOrder();
    const requestId = requestIdFor(o.orderNo);
    const { error } = await adminClient()
      .from("approval_requests")
      .insert({ request_id: requestId, order_id: o.orderId, payload: "x", created_at: new Date().toISOString() });
    expect(error?.code).toBe("23514");

    const { data } = await adminClient().from("approval_requests").select("id").eq("order_id", o.orderId);
    expect(data).toEqual([]);
  });

  it("INV-M6: 결제가 끝나면 같은 처리 안에서 승인 요청이 생기고 주문은 등록 상태가 된다", async () => {
    const o = await registerTestOrder();
    const requestId = await payTestOrder(o);

    const { data: req } = await adminClient().from("approval_requests").select("request_id, status").eq("order_id", o.orderId);
    expect(req).toEqual([{ request_id: requestId, status: "waiting" }]);
    const { data: order } = await adminClient().from("orders").select("status, registered_at").eq("id", o.orderId).single();
    expect(order?.status).toBe("registered");
    expect(order?.registered_at).not.toBeNull();
  });

  it("INV-M6 S6: 결제가 실패로 끝나면 승인 요청이 생기지 않는다", async () => {
    const o = await registerTestOrder();
    const { data: changed } = await adminClient().rpc("settle_payment", {
      p_toss_order_id: o.tossOrderId,
      p_status: "failed",
      p_payment_key: null,
      p_request_id: requestIdFor(o.orderNo),
      p_payload: "x",
      p_requested_at: new Date().toISOString(),
    });
    expect(changed).toBe(true);
    const { data } = await adminClient().from("approval_requests").select("id").eq("order_id", o.orderId);
    expect(data).toEqual([]);
    const { data: order } = await adminClient().from("orders").select("status").eq("id", o.orderId).single();
    expect(order?.status).toBe("pending_payment");
  });
});

describe("INV-M5: 한 주문의 결제 완료 기록은 하나다", () => {
  it("INV-M5 S5b: 승인 권리 얻기(claim)가 동시에 두 번 와도 하나만 얻는다", async () => {
    const o = await registerTestOrder();
    const results = await Promise.all([
      adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId }),
      adminClient().rpc("claim_payment", { p_toss_order_id: o.tossOrderId }),
    ]);
    expect(results.map((r) => r.data).sort()).toEqual([false, true]);
  });

  it("INV-M5 S5: 이미 끝난 결제에 결과를 다시 반영하면 아무것도 바꾸지 않는다", async () => {
    const o = await registerTestOrder();
    await payTestOrder(o);
    const { data: again } = await adminClient().rpc("settle_payment", {
      p_toss_order_id: o.tossOrderId,
      p_status: "done",
      p_payment_key: "pk_other",
      p_request_id: `${requestIdFor(o.orderNo)}x`,
      p_payload: "x",
      p_requested_at: new Date().toISOString(),
    });
    expect(again).toBe(false);
    const { data: pays } = await adminClient().from("payments").select("payment_key").eq("order_id", o.orderId);
    expect(pays).toEqual([{ payment_key: `pk_${o.tossOrderId}` }]);
    const { data: reqs } = await adminClient().from("approval_requests").select("id").eq("order_id", o.orderId);
    expect(reqs).toHaveLength(1);
  });

  it("INV-M5: 같은 주문에 두 번째 첫 결제 완료 기록은 DB 가 거부한다", async () => {
    const o = await registerTestOrder();
    await payTestOrder(o);
    const { error } = await adminClient().from("payments").insert({
      order_id: o.orderId,
      kind: "initial",
      toss_order_id: `${o.tossOrderId}_2`,
      amount_krw: 6900,
      goods_krw: 0,
      service_fee_krw: 1400,
      inspection_fee_krw: 1500,
      shipping_fee_krw: 4000,
      status: "done",
      payment_key: "pk_dup",
    });
    expect(error?.code).toBe("23505");
  });
});

describe("INV-M7: 결제 기록 네 칸의 합은 결제 금액과 같다", () => {
  it("INV-M7 S7b: 네 칸의 합이 금액과 다르면 등록이 통째로 거부된다", async () => {
    const { error } = await adminClient().rpc("register_order", {
      p_fan_id: "00000000-0000-4000-a000-000000000001",
      p_creator_id: "00000000-0000-4000-b000-000000000001",
      p_order_no: "FC-TSUMBAD",
      p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false,
      p_tiers: ["small"],
      p_toss_order_id: "pay_test_sum_mismatch",
      p_goods_krw: 0,
      p_service_fee_krw: 1400,
      p_inspection_fee_krw: 1500,
      p_shipping_fee_krw: 4000,
      p_amount_krw: 100,
    });
    // 등록 함수는 칸마다 등록 순간의 요금표와 먼저 맞춰 본다(admin-console INV-K3) — 합이 틀린 기록은 요금표와도 다르므로 거기서 거부된다
    expect(error?.code).toBe("P0031");
    // 주문·상자도 남지 않는다(한 처리)
    const { data } = await adminClient().from("orders").select("id").eq("order_no", "FC-TSUMBAD");
    expect(data).toEqual([]);
  });

  it("INV-M7 S7: 소형 하나의 기록은 상품 대금 0 · 기본 서비스료 1,400 · 검수비 1,500 · 배송비 칸 4,000", async () => {
    const o = await registerTestOrder();
    const { data } = await adminClient()
      .from("payments")
      .select("amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw")
      .eq("order_id", o.orderId)
      .single();
    expect(data).toEqual({ amount_krw: 6900, goods_krw: 0, service_fee_krw: 1400, inspection_fee_krw: 1500, shipping_fee_krw: 4000 });
  });
});

describe("INV-M11: 한 상자의 차액 요청은 하나다", () => {
  it("INV-M11: 같은 상자에 두 번째 차액 요청은 DB 가 거부한다", async () => {
    const o = await registerTestOrder();
    const { data: box } = await adminClient().from("boxes").select("id").eq("order_id", o.orderId).single();
    const diff = (suffix: string) => ({
      order_id: o.orderId,
      kind: "difference",
      box_id: box?.id,
      toss_order_id: `${o.tossOrderId}_${suffix}`,
      amount_krw: 2000,
      goods_krw: 0,
      service_fee_krw: 500,
      inspection_fee_krw: 500,
      shipping_fee_krw: 1000,
    });
    expect((await adminClient().from("payments").insert(diff("d1"))).error).toBeNull();
    expect((await adminClient().from("payments").insert(diff("d2"))).error?.code).toBe("23505");
  });
});

describe("등록 입력 경계는 DB 에도 있다", () => {
  it("INV-M1 S1c: 상자 0개·11개·대형 초과 신고는 등록되지 않는다", async () => {
    const base = {
      p_fan_id: "00000000-0000-4000-a000-000000000001",
      p_creator_id: "00000000-0000-4000-b000-000000000001",
      p_item_kind: "시험 선물",
      p_has_electronics_or_metal: false,
      p_goods_krw: 0,
      p_service_fee_krw: 1400,
      p_inspection_fee_krw: 1500,
      p_shipping_fee_krw: 4000,
      p_amount_krw: 6900,
    };
    const zero = await adminClient().rpc("register_order", { ...base, p_order_no: "FC-TZERO1", p_toss_order_id: "pay_test_zero1", p_tiers: [] });
    expect(zero.error?.code).toBe("22023");
    const many = await adminClient().rpc("register_order", {
      ...base,
      p_order_no: "FC-TMANY1",
      p_toss_order_id: "pay_test_many1",
      p_tiers: Array<string>(11).fill("small"),
    });
    expect(many.error?.code).toBe("22023");
    const over = await adminClient().rpc("register_order", { ...base, p_order_no: "FC-TOVER1", p_toss_order_id: "pay_test_over1", p_tiers: ["oversize"] });
    // 대형 초과는 요금표에 없는 구간이다 — 받을 수 없는 상자 구간(admin-console INV-K6)
    expect(over.error?.code).toBe("22023");
  });
});
