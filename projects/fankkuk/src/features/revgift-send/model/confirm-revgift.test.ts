import { describe, expect, it } from "vitest";
import { createTossPaymentsClient } from "@/shared/api/toss-payments/client";
import { confirmRevgiftPayment, type RevgiftPayment, type RevgiftPaymentStore } from "./confirm-revgift";

// 토스 승인 API 만 가짜로 둔다(외부). 대조·기록·한 번만 확정은 실제 코드가 돈다.
function fakeToss(respond: (b: { orderId: string; amount: number }) => unknown) {
  const calls: { orderId: string; amount: number }[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { orderId: string; amount: number };
    calls.push(body);
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify(respond(body)), { status: 200 });
  }) as unknown as typeof fetch;
  return { client: createTossPaymentsClient({ secretKey: "test_gsk_x", env: { NODE_ENV: "test" }, fetchImpl }), calls };
}

const done = (b: { orderId: string; amount: number }) => ({ status: "DONE", orderId: b.orderId, totalAmount: b.amount });

function memoryStore(initial: RevgiftPayment): RevgiftPaymentStore & { row: RevgiftPayment } {
  const row = { ...initial };
  return {
    row,
    async find(id) {
      return id === row.orderId ? { ...row } : null;
    },
    async claim(id) {
      if (id !== row.orderId || row.status !== "pending") return false;
      row.status = "confirming";
      return true;
    },
    async settle(id, outcome) {
      if (id !== row.orderId || (row.status !== "pending" && row.status !== "confirming")) return false;
      row.status = outcome.status;
      return true;
    },
  };
}

const pending: RevgiftPayment = { orderId: "rgpay_1", amountKrw: 10800, status: "pending", senderId: "creator-haru" };

describe("역조공 결제 확정 (payment INV-M2·M3·M5 를 역조공 결제에 그대로)", () => {
  it("INV-R3: 금액이 맞고 DONE 이면 결제 완료 — 받기 기한이 여기서 시작한다", async () => {
    const store = memoryStore(pending);
    const toss = fakeToss(done);
    const r = await confirmRevgiftPayment({ store, toss: toss.client }, "creator-haru", { orderId: "rgpay_1", amount: "10800", paymentKey: "pk" });
    expect(r).toEqual({ ok: true });
    expect(store.row.status).toBe("done");
  });

  it("INV-M2 (실패경로): 금액이 다르면 승인 API 를 부르지 않고 실패로 닫는다", async () => {
    const store = memoryStore(pending);
    const toss = fakeToss(done);
    const r = await confirmRevgiftPayment({ store, toss: toss.client }, "creator-haru", { orderId: "rgpay_1", amount: "100", paymentKey: "pk" });
    expect(r).toEqual({ ok: false, reason: "amount_mismatch" });
    expect(toss.calls).toHaveLength(0);
    expect(store.row.status).toBe("failed");
  });

  it("INV-M3 (실패경로): 승인 응답이 DONE 이 아니거나 금액이 다르면 완료가 아니다", async () => {
    for (const respond of [() => ({ status: "ABORTED", orderId: "rgpay_1", totalAmount: 10800 }), () => ({ status: "DONE", orderId: "rgpay_1", totalAmount: 1 })]) {
      const store = memoryStore(pending);
      const r = await confirmRevgiftPayment({ store, toss: fakeToss(respond).client }, "creator-haru", { orderId: "rgpay_1", amount: "10800", paymentKey: "pk" });
      expect(r.ok).toBe(false);
      expect(store.row.status).toBe("failed");
    }
  });

  it("INV-M5 (실패경로): 같은 결제의 확정이 동시에 두 번 와도 승인 API 는 한 번만 부른다", async () => {
    const store = memoryStore(pending);
    const toss = fakeToss(done);
    const ret = { orderId: "rgpay_1", amount: "10800", paymentKey: "pk" };
    await Promise.all([confirmRevgiftPayment({ store, toss: toss.client }, "creator-haru", ret), confirmRevgiftPayment({ store, toss: toss.client }, "creator-haru", ret)]);
    expect(toss.calls).toHaveLength(1);
    expect(store.row.status).toBe("done");
  });

  it("INV-R1 (실패경로): 보낸 크리에이터가 아니면 없는 결제와 같다", async () => {
    const store = memoryStore(pending);
    const toss = fakeToss(done);
    for (const requester of ["creator-momo", null]) {
      const r = await confirmRevgiftPayment({ store, toss: toss.client }, requester, { orderId: "rgpay_1", amount: "10800", paymentKey: "pk" });
      expect(r).toEqual({ ok: false, reason: "no_pending_payment" });
    }
    expect(toss.calls).toHaveLength(0);
  });
});
