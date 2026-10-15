import { describe, expect, it } from "vitest";
import { readTierPrices } from "@/entities/payment/api/read-tier-prices";
import { createSupabasePaymentStore } from "@/entities/payment/api/supabase-payment-store";
import { parseSigningPayload } from "@/entities/order/model/signing-payload";
import { confirmPayment } from "@/features/checkout/model/checkout";
import { createCreatorRelationReader } from "@/features/gift-register/api/creator-relation";
import { registerGift } from "@/features/gift-register/model/register-gift";
import { checkoutRequesterId } from "@/features/gift-register/model/sender-rule";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { adminClient, psql, SEED, signedInClient } from "./helpers";

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
  itemCategory: "other", itemOther: "통합 시험 선물",
  smallCount: "1",
  mediumCount: "1",
  largeCount: "0",
  electronicsOrMetal: "yes",
  // 화면이 보여 준 합계(소형 6,900 + 중형 8,900) — 서버는 비교에만 쓴다(admin-console INV-K3)
  quotedTotalKrw: 15800,
  ...extra,
});

const fan = { userId: SEED.fanId, role: "fan" } as const;
const creatorRelation = createCreatorRelationReader(adminClient());
const readPrices = () => readTierPrices(adminClient());

describe("선물 등록을 DB 에", () => {
  it("INV-L3 (S3): 본문에 달토끼 ID 를 넣어도 주문의 팬은 로그인한 별빛이다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form({ fanId: SEED.otherFanId, fan_id: SEED.otherFanId }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    const { data } = await adminClient().from("orders").select("fan_id, status, has_electronics_or_metal").eq("order_no", r.orderNo).single();
    expect(data).toEqual({ fan_id: SEED.fanId, status: "pending_payment", has_electronics_or_metal: true });
  });

  it("INV-M1 · INV-M7: 소형 1 + 중형 1 = 15,800원, 칸 나눔은 서비스료 6,800 · 배송비 9,000", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form({ amountKrw: 100 }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.amountKrw).toBe(15800);
    const { data } = await adminClient()
      .from("payments")
      .select("amount_krw, goods_krw, service_fee_krw, inspection_fee_krw, shipping_fee_krw, status")
      .eq("toss_order_id", r.orderId)
      .single();
    expect(data).toEqual({ amount_krw: 15800, goods_krw: 0, service_fee_krw: 3300, inspection_fee_krw: 3500, shipping_fee_krw: 9000, status: "pending" });
    const { count } = await adminClient().from("boxes").select("id", { count: "exact", head: true }).eq("order_id", (await orderId(r.orderNo))!);
    expect(count).toBe(2);
  });

  it("없는 크리에이터로는 등록되지 않고(404) 아무것도 남지 않는다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const before = (await adminClient().from("orders").select("id", { count: "exact", head: true })).count;
    expect(await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form({ creatorId: "00000000-0000-4000-b000-000000000999" }))).toMatchObject({
      ok: false,
      status: 404,
    });
    const after = (await adminClient().from("orders").select("id", { count: "exact", head: true })).count;
    expect(after).toBe(before);
  });

  it("INV-L3: 달토끼로 로그인해 별빛의 결제를 승인하려 하면 아무것도 바뀌지 않는다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const toss = fakeToss();
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form());
    if (!r.ok) throw new Error();
    const out = await confirmPayment({ store, toss: toss.client }, SEED.otherFanId, { orderId: r.orderId, amount: "1", paymentKey: "x" });
    expect(out).toEqual({ ok: false, reason: "no_pending_payment" });
    expect(toss.calls).toHaveLength(0);
    const { data: pay } = await adminClient().from("payments").select("status").eq("toss_order_id", r.orderId).single();
    expect(pay?.status).toBe("pending");
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
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form());
    if (!r.ok) throw new Error();

    const out = await confirmPayment({ store, toss: toss.client }, SEED.fanId, { orderId: r.orderId, amount: String(r.amountKrw), paymentKey: "tgen_it_1" });
    expect(out).toEqual({ ok: true, orderId: r.orderId, orderNo: r.orderNo, awaitingDeposit: false });

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
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form());
    if (!r.ok) throw new Error();
    const ret = { orderId: r.orderId, amount: String(r.amountKrw), paymentKey: "tgen_it_2" };
    await confirmPayment({ store, toss: toss.client }, SEED.fanId, ret);
    const again = await confirmPayment({ store, toss: toss.client }, SEED.fanId, ret);
    expect(again.ok).toBe(true);
    expect(toss.calls).toHaveLength(1);
    const { data } = await adminClient().from("approval_requests").select("id").eq("order_id", (await orderId(r.orderNo))!);
    expect(data).toHaveLength(1);
  });

  it("INV-M2 (S2) · INV-M6: 금액이 다르면 승인 API 를 부르지 않고, 승인 요청도 없다", async () => {
    const store = createSupabasePaymentStore(adminClient());
    const toss = fakeToss();
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form());
    if (!r.ok) throw new Error();
    const out = await confirmPayment({ store, toss: toss.client }, SEED.fanId, { orderId: r.orderId, amount: "100", paymentKey: "tgen_it_3" });
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
    const r = await registerGift({ store, viewer: fan, creatorRelation, readPrices }, form());
    if (!r.ok) throw new Error();
    const out = await confirmPayment({ store, toss: toss.client }, SEED.fanId, { orderId: r.orderId, amount: String(r.amountKrw), paymentKey: "tgen_it_4" });
    expect(out).toEqual({ ok: false, reason: "not_approved" });
    const { data: order } = await adminClient().from("orders").select("status").eq("order_no", r.orderNo).single();
    expect(order?.status).toBe("pending_payment");
    const { data: pay } = await adminClient().from("payments").select("status").eq("toss_order_id", r.orderId).single();
    expect(pay?.status).toBe("failed");
    const { data: reqs } = await adminClient().from("approval_requests").select("id").eq("order_id", (await orderId(r.orderNo))!);
    expect(reqs).toEqual([]);
  });
});

describe("크리에이터가 보낸 선물도 결제 승인까지 (session-login INV-L3·INV-L9)", () => {
  const MOMO_PAGE = "00000000-0000-4000-b000-000000000002";
  const haruViewer = { userId: SEED.creatorProfileId, role: "creator" } as const;

  it("하루가 모모를 팔로우하고 보내면, 결제 확정 뒤 모모의 승인 요청 목록에 하루 이름으로 뜬다", async () => {
    psql(`insert into public.follows (fan_id, creator_id) values ('${SEED.creatorProfileId}', '${MOMO_PAGE}') on conflict do nothing`);
    try {
      const store = createSupabasePaymentStore(adminClient());
      const toss = fakeToss();
      const r = await registerGift({ store, viewer: haruViewer, creatorRelation, readPrices }, form({ creatorId: MOMO_PAGE }));
      if (!r.ok) throw new Error(JSON.stringify(r));
      // 결제 확정은 라우트와 같은 판정(checkoutRequesterId)으로 요청자를 정한다
      const out = await confirmPayment({ store, toss: toss.client }, checkoutRequesterId(haruViewer), {
        orderId: r.orderId,
        amount: String(r.amountKrw),
        paymentKey: "tgen_it_creator",
      });
      expect(out).toEqual({ ok: true, orderId: r.orderId, orderNo: r.orderNo, awaitingDeposit: false });
      const momo = await signedInClient("momo_creator");
      const list = (await momo.rpc("my_approval_requests")).data as { order_no: string; fan_nickname: string }[];
      expect(list.find((x) => x.order_no === r.orderNo)?.fan_nickname).toBe("하루");
      // 보낸 사람(하루)의 보낸 선물 목록에도 나온다
      const haru = await signedInClient("haru_creator");
      const mine = (await haru.rpc("my_gifts")).data as { order_no: string }[];
      expect(mine.map((g) => g.order_no)).toContain(r.orderNo);
    } finally {
      psql(`delete from public.follows where fan_id = '${SEED.creatorProfileId}'`);
    }
  });

  it("운영자는 결제를 확정하지 못한다 — 요청자가 없다", () => {
    expect(checkoutRequesterId({ userId: "op", role: "operator" })).toBeNull();
    expect(checkoutRequesterId(null)).toBeNull();
    expect(checkoutRequesterId(haruViewer)).toBe(SEED.creatorProfileId);
    expect(checkoutRequesterId(fan)).toBe(SEED.fanId);
  });
});
