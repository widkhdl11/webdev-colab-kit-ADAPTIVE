import { describe, expect, it } from "vitest";
import type { TossPaymentsClient } from "@/shared/api/toss-payments/client";
import { confirmBoxPayment, startBoxPayment, type BoxPayment, type BoxPaymentStore } from "./box-payment";

// 선물함 명세서 결제 (revgift-box INV-GB18). DB·결제사는 가짜 — 대조·주인 판정·한 번만 확정은 진짜 코드(payment 공통 흐름)를 지난다.

const BOX = "11111111-1111-4111-8111-111111111111";
const HARU = "00000000-0000-4000-a000-000000000011";
const MOMO = "00000000-0000-4000-a000-000000000012";
const ORDER = `gbpay_${"a".repeat(32)}`;

const creator = (userId: string) => ({ userId, role: "creator" as const }) as never;

describe("INV-GB18: 결제 대기 만들기", () => {
  it("INV-GB18 S13c: 본문은 읽지 않고 DB 가 정한 금액을 돌려준다", async () => {
    const calls: unknown[] = [];
    const client = { rpc: async (fn: string, args: unknown) => (calls.push([fn, args]), { data: { toss_order_id: ORDER, amount_krw: 18500 }, error: null }) };
    expect(await startBoxPayment({ client: client as never, viewer: creator(HARU) }, BOX)).toEqual({ ok: true, tossOrderId: ORDER, amountKrw: 18500 });
    expect(calls).toEqual([["revgift_box_start_payment", { p_box_id: BOX }]]);
  });

  it("INV-GB18 S1b·S18c (실패경로): 명세서 전·결제할 수 없는 상태는 409, 남의 선물함은 404, 팬·로그인 안 함은 DB 전에 거부", async () => {
    const err = (code: string) => ({ rpc: async () => ({ data: null, error: { code } }) }) as never;
    expect((await startBoxPayment({ client: err("P0022"), viewer: creator(HARU) }, BOX)).ok).toBe(false);
    expect(await startBoxPayment({ client: err("P0022"), viewer: creator(HARU) }, BOX)).toMatchObject({ status: 409 });
    expect(await startBoxPayment({ client: err("P0002"), viewer: creator(MOMO) }, BOX)).toMatchObject({ status: 404 });
    expect(await startBoxPayment({ client: err("P0002"), viewer: null }, BOX)).toMatchObject({ status: 401 });
    expect(await startBoxPayment({ client: err("P0002"), viewer: { userId: HARU, role: "fan" } as never }, BOX)).toMatchObject({ status: 403 });
    expect(await startBoxPayment({ client: err("P0002"), viewer: creator(HARU) }, "not-a-uuid")).toMatchObject({ status: 404 });
  });
});

function store(record: BoxPayment | null) {
  const log: string[] = [];
  const s: BoxPaymentStore = {
    find: async () => record,
    claim: async () => (log.push("claim"), true),
    settle: async (_id, o) => (log.push(`settle:${o.status}`), true),
  };
  return { s, log };
}
const toss = (status = "DONE", amount = 18500) =>
  ({ confirm: async () => ({ status, orderId: ORDER, totalAmount: amount }) }) as unknown as TossPaymentsClient;

describe("INV-GB18: 결제 확정", () => {
  const rec: BoxPayment = { orderId: ORDER, amountKrw: 18500, status: "pending", ownerId: HARU, boxId: BOX };

  it("INV-GB18: 주인이 돌아오면 승인하고 그 선물함으로 보낸다", async () => {
    const st = store(rec);
    expect(await confirmBoxPayment({ store: st.s, toss: toss() }, HARU, { orderId: ORDER, amount: "18500", paymentKey: "pk" })).toEqual({ ok: true, boxId: BOX });
    expect(st.log).toEqual(["claim", "settle:done"]);
  });

  it("INV-GB18 S18c (실패경로): 남의 결제는 없는 결제와 같다 — 확정을 시작하지 않고 돌아갈 선물함도 알려 주지 않는다", async () => {
    const st = store(rec);
    expect(await confirmBoxPayment({ store: st.s, toss: toss() }, MOMO, { orderId: ORDER, amount: "18500", paymentKey: "pk" })).toEqual({
      ok: false,
      reason: "no_pending_payment",
      boxId: null,
    });
    expect(st.log).toEqual([]);
  });

  it("INV-GB18 S13c (실패경로): 돌아온 금액이 명세서 금액과 다르면 실패로 닫고 승인하지 않는다", async () => {
    const st = store(rec);
    const r = await confirmBoxPayment({ store: st.s, toss: toss() }, HARU, { orderId: ORDER, amount: "100", paymentKey: "pk" });
    expect(r).toMatchObject({ ok: false, reason: "amount_mismatch", boxId: BOX });
    expect(st.log).toEqual(["settle:failed"]);
  });
});
