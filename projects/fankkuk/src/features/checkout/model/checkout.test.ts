import { describe, expect, it } from "vitest";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { createMemoryPaymentStore } from "@/entities/payment/api/memory-payment-store";
import { confirmPayment, startCheckout } from "./checkout";

// 토스 승인 API 만 가짜로 둔다(외부). 대조·기록·멱등은 실제 코드가 돈다.
function fakeToss(respond: (body: { orderId: string; amount: number }) => unknown) {
  const calls: { orderId: string; amount: number; idempotencyKey: string | null }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { orderId: string; amount: number };
    calls.push({ ...body, idempotencyKey: new Headers(init.headers).get("idempotency-key") });
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify(respond(body)), { status: 200 });
  }) as unknown as typeof fetch;
  const client = createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "test" }, fetchImpl });
  return { client, calls };
}

const done = (b: { orderId: string; amount: number }) => ({ status: "DONE", orderId: b.orderId, totalAmount: b.amount });

function setup(respond = done) {
  const store = createMemoryPaymentStore({ env: { NODE_ENV: "test" } });
  const toss = fakeToss(respond);
  return { store, toss, deps: { store, toss: toss.client, shippingFeeKrw: 4000 } };
}

describe("결제 흐름", () => {
  it("INV-M1 (S1): 결제 대기는 서버가 계산한 9,000원으로 만들어진다", async () => {
    const { deps } = setup();
    const pending = await startCheckout(deps, { orderNo: "FC-7K3M9" });
    expect(pending.amountKrw).toBe(9000);
    expect(pending.charge).toEqual({ goodsKrw: 0, serviceFeeKrw: 5000, shippingFeeKrw: 4000, totalKrw: 9000 });
  });

  it("INV-M3 (S3): 금액이 맞고 승인 응답이 DONE 이면 결제 완료로 기록된다", async () => {
    const { deps, store, toss } = setup();
    const p = await startCheckout(deps, { orderNo: "FC-7K3M9" });

    const res = await confirmPayment(deps, { orderId: p.orderId, amount: "9000", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: true, orderId: p.orderId });
    expect((await store.find(p.orderId))?.status).toBe("done");
    expect(toss.calls).toHaveLength(1);
    expect(toss.calls[0]!.idempotencyKey).toBe(`confirm-${p.orderId}`);
  });

  it("INV-M2 (S2, 실패경로): 금액이 다르면 승인 API 를 부르지 않고 결제 대기를 실패로 닫는다", async () => {
    const { deps, store, toss } = setup();
    const p = await startCheckout(deps, { orderNo: "FC-7K3M9" });

    const res = await confirmPayment(deps, { orderId: p.orderId, amount: "100", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(toss.calls).toHaveLength(0);
    expect((await store.find(p.orderId))?.status).toBe("failed");
  });

  it("INV-M3 (S3b, 실패경로): 승인 응답이 ABORTED 면 완료로 기록하지 않는다", async () => {
    const { deps, store } = setup((b) => ({ status: "ABORTED", orderId: b.orderId, totalAmount: b.amount }));
    const p = await startCheckout(deps, { orderNo: "FC-7K3M9" });

    const res = await confirmPayment(deps, { orderId: p.orderId, amount: "9000", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: false, reason: "not_approved" });
    expect((await store.find(p.orderId))?.status).toBe("failed");
  });

  it("INV-M5 (S5): 성공 주소를 새로고침해도 승인 API 는 한 번만 불리고 완료 기록은 그대로다", async () => {
    const { deps, store, toss } = setup();
    const p = await startCheckout(deps, { orderNo: "FC-7K3M9" });
    const ret = { orderId: p.orderId, amount: "9000", paymentKey: "tgen_1" };

    await confirmPayment(deps, ret);
    const again = await confirmPayment(deps, ret);

    expect(again).toEqual({ ok: true, orderId: p.orderId });
    expect(toss.calls).toHaveLength(1);
    expect((await store.find(p.orderId))?.status).toBe("done");
  });

  it("INV-M5 (S5b, 동시): 승인 처리 두 개가 동시에 와도 승인 API 는 한 번만 불린다", async () => {
    const { deps, toss } = setup();
    const p = await startCheckout(deps, { orderNo: "FC-7K3M9" });
    const ret = { orderId: p.orderId, amount: "9000", paymentKey: "tgen_1" };

    const [a, b] = await Promise.all([confirmPayment(deps, ret), confirmPayment(deps, ret)]);

    expect(toss.calls).toHaveLength(1);
    expect([a.ok, b.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });

  it("INV-M2 (S2b, 실패경로): 없는 orderId 로 오면 승인 API 를 부르지 않는다", async () => {
    const { deps, toss } = setup();
    const res = await confirmPayment(deps, { orderId: "pay_nope00", amount: "9000", paymentKey: "tgen_1" });
    expect(res).toEqual({ ok: false, reason: "no_pending_payment" });
    expect(toss.calls).toHaveLength(0);
  });
});

describe("메모리 저장소", () => {
  it("INV-M5 (실패경로): 운영 환경에서는 메모리 저장소를 만들 수 없다 — 재시작하면 결제 기록이 사라진다", () => {
    expect(() => createMemoryPaymentStore({ env: { NODE_ENV: "production" } })).toThrow();
    expect(() => createMemoryPaymentStore({ env: { NODE_ENV: "development", VERCEL_ENV: "production" } })).toThrow();
  });
});
