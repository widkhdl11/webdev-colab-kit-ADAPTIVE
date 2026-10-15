import { describe, expect, it } from "vitest";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { createMemoryPaymentStore } from "@/entities/payment/api/memory-payment-store";
import type { PaymentStore } from "@/entities/payment/api/payment-store";
import { computeCharge } from "@/entities/payment/model/charge";
import type { PriceTable } from "@/entities/payment/model/price-table";
import { parseSigningPayload } from "@/entities/order/model/signing-payload";
import { confirmPayment } from "./checkout";

// 첫 요금표(시험용 고정값). 운영 값은 DB 요금표에서만 온다.
const PRICES: PriceTable = {
  small: { priceKrw: 6900, carrierCostKrw: 4000, inspectionFeeKrw: 1500 },
  medium: { priceKrw: 8900, carrierCostKrw: 5000, inspectionFeeKrw: 2000 },
  large: { priceKrw: 10900, carrierCostKrw: 6500, inspectionFeeKrw: 2500 },
};

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

/** 등록이 만든 결제 대기 하나(등록 자체는 gift-register 의 registerGift 가 한다). */
let seq = 0;
async function pendingFor(store: PaymentStore, boxes: ("small" | "medium")[]) {
  seq += 1;
  return store.create({
    orderId: `pay_test${String(seq).padStart(4, "0")}`,
    orderNo: "FC-7K3M9",
    charge: computeCharge(PRICES, { boxes }),
    registration: { fanId: "fan-byeolbit", creatorId: "creator-1", itemCategory: "other", itemOther: "손편지", hasElectronicsOrMetal: false, boxes, anniversaryName: null, hardNoticeCategory: null },
  });
}

function setup(respond = done) {
  const store = createMemoryPaymentStore({ env: { NODE_ENV: "test" }, nicknames: { "fan-byeolbit": "별빛" } });
  const toss = fakeToss(respond);
  return { store, toss, deps: { store, toss: toss.client } };
}

describe("결제 흐름", () => {
  it("INV-M3 (S3): 금액이 맞고 승인 응답이 DONE 이면 결제 완료로 기록된다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);

    const res = await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: true, orderId: p.orderId, orderNo: "FC-7K3M9", awaitingDeposit: false });
    expect((await store.find(p.orderId))?.status).toBe("done");
    expect(toss.calls).toHaveLength(1);
    expect(toss.calls[0]!.idempotencyKey).toBe(`confirm-${p.orderId}`);
  });

  it("INV-M2 (S2, 실패경로): 금액이 다르면 승인 API 를 부르지 않고 결제 대기를 실패로 닫는다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);

    const res = await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "100", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(toss.calls).toHaveLength(0);
    expect((await store.find(p.orderId))?.status).toBe("failed");
  });

  it("INV-M3 (S3b, 실패경로): 승인 응답이 ABORTED 면 완료로 기록하지 않는다", async () => {
    const { deps, store } = setup((b) => ({ status: "ABORTED", orderId: b.orderId, totalAmount: b.amount }));
    const p = await pendingFor(store, ["small"]);

    const res = await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: false, reason: "not_approved" });
    expect((await store.find(p.orderId))?.status).toBe("failed");
  });

  it("INV-M5 (S5): 성공 주소를 새로고침해도 승인 API 는 한 번만 불리고 완료 기록은 그대로다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);
    const ret = { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" };

    await confirmPayment(deps, "fan-byeolbit", ret);
    const again = await confirmPayment(deps, "fan-byeolbit", ret);

    expect(again).toEqual({ ok: true, orderId: p.orderId, orderNo: "FC-7K3M9", awaitingDeposit: false });
    expect(toss.calls).toHaveLength(1);
    expect((await store.find(p.orderId))?.status).toBe("done");
  });

  it("INV-M5 (S5b, 동시): 승인 처리 두 개가 동시에 와도 승인 API 는 한 번만 불린다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);
    const ret = { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" };

    const [a, b] = await Promise.all([confirmPayment(deps, "fan-byeolbit", ret), confirmPayment(deps, "fan-byeolbit", ret)]);

    expect(toss.calls).toHaveLength(1);
    expect([a.ok, b.ok].filter(Boolean).length).toBeGreaterThanOrEqual(1);
  });

  it("INV-M15 S15b (실패경로): 24시간이 지나 실패로 닫힌 주문은 성공 주소로 돌아와도 승인 API 를 부르지 않는다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);
    // 자동 처리가 결제 대기를 실패로 닫았다
    expect(await store.settle(p.orderId, { status: "failed" })).toBe(true);

    const res = await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });

    expect(res).toEqual({ ok: false, reason: "not_approved" });
    expect(toss.calls).toHaveLength(0);
    expect((await store.find(p.orderId))?.status).toBe("failed");
    expect(store.approvalRequests()).toEqual([]);
  });

  it("INV-M15 S15c (실패경로): 읽은 뒤 승인 권리를 얻기 전에 닫혔으면 승인 API 를 부르지 않는다", async () => {
    const { store, toss } = setup();
    const p = await pendingFor(store, ["small"]);
    // 결제 기록을 읽은 직후 자동 처리가 닫는다 — 승인 권리(결제 대기일 때만)를 얻지 못한다
    const racing: PaymentStore = {
      ...store,
      find: async (id) => {
        const found = await store.find(id);
        await store.settle(id, { status: "failed" });
        return found;
      },
    };
    const res = await confirmPayment({ store: racing, toss: toss.client }, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });
    expect(res.ok).toBe(false);
    expect(toss.calls).toHaveLength(0);
    expect((await store.find(p.orderId))?.status).toBe("failed");
  });

  it("INV-M2 (S2b, 실패경로): 없는 orderId 로 오면 승인 API 를 부르지 않는다", async () => {
    const { deps, toss } = setup();
    const res = await confirmPayment(deps, "fan-byeolbit", { orderId: "pay_nope00", amount: "6900", paymentKey: "tgen_1" });
    expect(res).toEqual({ ok: false, reason: "no_pending_payment" });
    expect(toss.calls).toHaveLength(0);
  });
});

describe("결과를 모를 때·남의 결제·잘못된 입력", () => {
  it("INV-M3 · INV-M5: 승인 API 호출이 오류로 끝나면(결과 모름) 실패로 닫지 않고 승인 중으로 남긴다 — 실제로는 승인됐을 수 있다", async () => {
    const { store, toss } = setup();
    const throwing = { ...toss.client, confirm: async () => { throw new Error("timeout"); } };
    const p = await pendingFor(store, ["small"]);
    const res = await confirmPayment({ store, toss: throwing }, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });
    expect(res).toEqual({ ok: false, reason: "in_progress" });
    expect((await store.find(p.orderId))?.status).toBe("confirming");
    expect(store.approvalRequests()).toEqual([]);
  });

  it("INV-L3: 남의 결제를 처리하려 하면 없는 결제로 보고 아무것도 바꾸지 않는다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);
    const res = await confirmPayment(deps, "fan-daltokki", { orderId: p.orderId, amount: "100", paymentKey: "tgen_1" });
    expect(res).toEqual({ ok: false, reason: "no_pending_payment" });
    expect((await store.find(p.orderId))?.status).toBe("pending");
    expect(toss.calls).toHaveLength(0);
  });

  it("INV-L3 (S3b): 로그인하지 않았으면(요청자 없음) 아무것도 바꾸지 않는다", async () => {
    const { deps, store, toss } = setup();
    const p = await pendingFor(store, ["small"]);
    const res = await confirmPayment(deps, null, { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });
    expect(res).toEqual({ ok: false, reason: "no_pending_payment" });
    expect((await store.find(p.orderId))?.status).toBe("pending");
    expect(toss.calls).toHaveLength(0);
  });

  it("꼴이 잘못된 입력(빈 결제 키·금액 꼴 아님)은 거부만 하고 결제 대기를 닫지 않는다", async () => {
    const { deps, store } = setup();
    const p = await pendingFor(store, ["small"]);
    expect((await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "" })).ok).toBe(false);
    expect((await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6,900", paymentKey: "tgen_1" })).ok).toBe(false);
    expect((await store.find(p.orderId))?.status).toBe("pending");
  });
});

describe("결제 완료와 승인 요청", () => {
  it("INV-M6 · INV-S1: 결제가 끝날 때 승인 요청을 같이 넘긴다 — 원문은 요청 ID·주문번호·시각·팬 닉네임 해시 네 값", async () => {
    const { deps, store } = setup();
    const p = await pendingFor(store, ["small"]);
    await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });

    const settled = store.approvalRequests();
    expect(settled).toHaveLength(1);
    const req = settled[0]!;
    const fields = parseSigningPayload(req.payload);
    expect(fields).not.toBeNull();
    expect(fields!.requestId).toBe(req.requestId);
    expect(fields!.orderNo).toBe("FC-7K3M9");
    expect(fields!.requestedAt).toBe(req.requestedAt);
    const expectedHash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("별빛"))).toString("hex");
    expect(fields!.fanNicknameHash).toBe(expectedHash);
    expect(req.payload).not.toContain("별빛");
  });

  it("INV-M6 (S6, 실패경로): 승인되지 않은 결제에는 승인 요청을 넘기지 않는다", async () => {
    const { deps, store } = setup((b) => ({ status: "ABORTED", orderId: b.orderId, totalAmount: b.amount }));
    const p = await pendingFor(store, ["small"]);
    await confirmPayment(deps, "fan-byeolbit", { orderId: p.orderId, amount: "6900", paymentKey: "tgen_1" });
    expect(store.approvalRequests()).toEqual([]);
  });
});

describe("메모리 저장소", () => {
  it("INV-M5 (실패경로): 운영 환경에서는 메모리 저장소를 만들 수 없다 — 재시작하면 결제 기록이 사라진다", () => {
    expect(() => createMemoryPaymentStore({ env: { NODE_ENV: "production" } })).toThrow();
    expect(() => createMemoryPaymentStore({ env: { NODE_ENV: "development", VERCEL_ENV: "production" } })).toThrow();
  });
});
