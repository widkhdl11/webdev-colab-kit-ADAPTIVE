import { describe, expect, it } from "vitest";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { parseSigningPayload } from "@/entities/order/model/signing-payload";
import { confirmPayment } from "@/features/checkout/model/checkout";
import { registerGift } from "@/features/gift-register/model/register-gift";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { adminClient, SEED, signedInClient } from "./helpers";

// 선물 등록 → 결제 승인 → 승인 요청까지 실제 DB 로. 토스 승인 API 만 가짜(외부)다.

function fakeToss(status = "DONE") {
  const calls: unknown[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { orderId: string; amount: number };
    calls.push(body);
    return new Response(JSON.stringify({ status, orderId: body.orderId, totalAmount: body.amount }), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, client: createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "test" }, fetchImpl }) };
}

const form = (extra: Record<string, unknown> = {}) => ({
  creatorId: SEED.haruCreatorId,
  itemKind: "통합 시험 선물",
  smallCount: "1",
  mediumCount: "1",
  electronicsOrMetal: "yes",
  ...extra,
});

const fan = { userId: SEED.fanId, role: "fan" } as const;

describe("선물 등록을 DB 에", () => {
  it("INV-L3 (S3): 본문에 달토끼 ID 를 넣어도 주문의 팬은 로그인한 별빛이다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const r = await registerGift({ store, viewer: fan }, form({ fanId: SEED.otherFanId, fan_id: SEED.otherFanId }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    const { data } = await adminClient().from("orders").select("fan_id, status, has_electronics_or_metal").eq("order_no", r.orderNo).single();
    expect(data).toEqual({ fan_id: SEED.fanId, status: "pending_payment", has_electronics_or_metal: true });
  });

  it("INV-M1 · INV-M7: 소형 1 + 중형 1 = 15,800원, 칸 나눔은 서비스료 6,800 · 배송비 9,000", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const r = await registerGift({ store, viewer: fan }, form({ amountKrw: 100 }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.amountKrw).toBe(15800);
    const { data } = await adminClient()
      .from("payments")
      .select("amount_krw, goods_krw, service_fee_krw, shipping_fee_krw, status")
      .eq("toss_order_id", r.orderId)
      .single();
    expect(data).toEqual({ amount_krw: 15800, goods_krw: 0, service_fee_krw: 6800, shipping_fee_krw: 9000, status: "pending" });
    const { count } = await adminClient().from("boxes").select("id", { count: "exact", head: true }).eq("order_id", (await orderId(r.orderNo))!);
    expect(count).toBe(2);
  });

  it("없는 크리에이터로는 등록되지 않는다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    await expect(registerGift({ store, viewer: fan }, form({ creatorId: "00000000-0000-4000-b000-000000000999" }))).rejects.toThrow();
  });
});

async function orderId(orderNo: string): Promise<string | undefined> {
  const { data } = await adminClient().from("orders").select("id").eq("order_no", orderNo).single();
  return data?.id as string | undefined;
}

describe("결제 승인 → 승인 요청", () => {
  it("INV-M3 · INV-M6: 승인되면 주문이 등록 상태가 되고 하루의 승인 요청 목록에 뜬다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const toss = fakeToss();
    const r = await registerGift({ store, viewer: fan }, form());
    if (!r.ok) throw new Error();

    const out = await confirmPayment({ store, toss: toss.client }, { orderId: r.orderId, amount: String(r.amountKrw), paymentKey: "tgen_it_1" });
    expect(out).toEqual({ ok: true, orderId: r.orderId, orderNo: r.orderNo });

    const { data: order } = await adminClient().from("orders").select("status").eq("order_no", r.orderNo).single();
    expect(order?.status).toBe("registered");
    const { data: req } = await adminClient()
      .from("approval_requests")
      .select("request_id, payload, status")
      .eq("order_id", (await orderId(r.orderNo))!)
      .single();
    expect(req?.status).toBe("waiting");
    const fields = parseSigningPayload(String(req?.payload));
    expect(fields?.orderNo).toBe(r.orderNo);
    expect(fields?.requestId).toBe(req?.request_id);

    const haru = await signedInClient("haru_creator");
    const list = (await haru.rpc("my_approval_requests")).data as { order_no: string; fan_nickname: string }[];
    expect(list.find((x) => x.order_no === r.orderNo)?.fan_nickname).toBe("별빛");
  });

  it("INV-M5 (S5): 성공 주소를 다시 열어도 승인 API 는 한 번, 승인 요청도 하나", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const toss = fakeToss();
    const r = await registerGift({ store, viewer: fan }, form());
    if (!r.ok) throw new Error();
    const ret = { orderId: r.orderId, amount: String(r.amountKrw), paymentKey: "tgen_it_2" };
    await confirmPayment({ store, toss: toss.client }, ret);
    const again = await confirmPayment({ store, toss: toss.client }, ret);
    expect(again.ok).toBe(true);
    expect(toss.calls).toHaveLength(1);
    const { data } = await adminClient().from("approval_requests").select("id").eq("order_id", (await orderId(r.orderNo))!);
    expect(data).toHaveLength(1);
  });

  it("INV-M2 (S2) · INV-M6: 금액이 다르면 승인 API 를 부르지 않고, 승인 요청도 없다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const toss = fakeToss();
    const r = await registerGift({ store, viewer: fan }, form());
    if (!r.ok) throw new Error();
    const out = await confirmPayment({ store, toss: toss.client }, { orderId: r.orderId, amount: "100", paymentKey: "tgen_it_3" });
    expect(out).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(toss.calls).toHaveLength(0);
    const { data: pay } = await adminClient().from("payments").select("status").eq("toss_order_id", r.orderId).single();
    expect(pay?.status).toBe("failed");
    const { data } = await adminClient().from("approval_requests").select("id").eq("order_id", (await orderId(r.orderNo))!);
    expect(data).toEqual([]);
  });

  it("INV-M3 (S3b): 승인 응답이 ABORTED 면 완료도 승인 요청도 없다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const toss = fakeToss("ABORTED");
    const r = await registerGift({ store, viewer: fan }, form());
    if (!r.ok) throw new Error();
    const out = await confirmPayment({ store, toss: toss.client }, { orderId: r.orderId, amount: String(r.amountKrw), paymentKey: "tgen_it_4" });
    expect(out).toEqual({ ok: false, reason: "not_approved" });
    const { data: order } = await adminClient().from("orders").select("status").eq("order_no", r.orderNo).single();
    expect(order?.status).toBe("pending_payment");
  });
});
