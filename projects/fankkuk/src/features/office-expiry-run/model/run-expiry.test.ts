import { describe, expect, it } from "vitest";
import { expiryRunSummary } from "./expiry-counts";
import { runExpiry, type PaymentReconcileRun } from "./run-expiry";

type Reply = { data?: unknown; error: { code: string } | null };

function fakeClient(reply: Reply, who = { operator: true, owner: false }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

const COUNTS = { gifts: 1, unmatched: 0, differences: 0, revgifts: 0, pending_gifts: 0, pending_revgifts: 0, held: 0, dispose_due: 2, return_reminders: 3 };
const PAYMENTS = { checked: 1, done: 1, failed: 0, review: 0, kept: 0, errors: 0 };

// 결제 다시 확인(payment INV-M19)을 대신하는 기록기 — 몇 번, 어느 주문번호로 불렸는지만 본다
function reconcileSpy(result: { ok: boolean; counts: typeof PAYMENTS } = { ok: true, counts: PAYMENTS }) {
  const calls: (string | null)[] = [];
  const run: PaymentReconcileRun = async (orderNo) => {
    calls.push(orderNo);
    return result;
  };
  return { calls, run };
}

describe("자동 처리 지금 돌리기 (office-workflow INV-W6)", () => {
  it("INV-W6: 한 줄만 — 주문번호를 넘기고 처리 건수를 돌려준다", async () => {
    const { calls, client } = fakeClient({ data: COUNTS, error: null });
    expect(await runExpiry(client, { orderNo: "FC-260927-0003" }, reconcileSpy().run)).toEqual({ status: 200, body: { counts: COUNTS, payments: PAYMENTS } });
    expect(calls).toEqual([{ fn: "office_run_expiry", args: { p_order_no: "FC-260927-0003" } }]);
  });

  it("INV-W6: 주문번호 없이 부르면 전부(null)", async () => {
    const { calls, client } = fakeClient({ data: COUNTS, error: null });
    expect((await runExpiry(client, {}, reconcileSpy().run)).status).toBe(200);
    expect(calls).toEqual([{ fn: "office_run_expiry", args: { p_order_no: null } }]);
  });

  it("INV-W6 (실패경로): 꼴이 틀린 주문번호·모르는 칸은 DB 를 부르지 않고 400", async () => {
    for (const body of [null, { orderNo: "" }, { orderNo: "FC 1; drop" }, { orderNo: "F".repeat(41) }, { orderNo: "FC-1", force: true }]) {
      const { calls, client } = fakeClient({ data: COUNTS, error: null });
      const r = reconcileSpy();
      expect((await runExpiry(client, body, r.run)).status).toBe(400);
      expect(calls).toEqual([]);
      expect(r.calls).toEqual([]);
    }
  });

  it("INV-W6 (실패경로): 운영자가 아니면 404 — 자동 처리 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ data: COUNTS, error: null }, { operator: false, owner: false });
    const r = reconcileSpy();
    expect(await runExpiry(client, { orderNo: "FC-1" }, r.run)).toEqual({ status: 404, body: { message: "요청한 항목을 찾을 수 없습니다." } });
    expect(calls).toEqual([]);
    expect(r.calls).toEqual([]);
  });

  it("INV-W6 (실패경로): DB 오류는 403·404·500, 답의 꼴이 다르면 500", async () => {
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["XX000", 500],
    ] as const) {
      const r = reconcileSpy();
      expect((await runExpiry(fakeClient({ error: { code } }).client, { orderNo: "FC-1" }, r.run)).status).toBe(status);
      expect(r.calls).toEqual([]);
    }
    expect((await runExpiry(fakeClient({ data: { gifts: "1" }, error: null }).client, {}, reconcileSpy().run)).status).toBe(500);
  });
});

describe("지금 돌리기의 결제 다시 확인 (payment INV-M19)", () => {
  it("INV-M19: 자동 처리가 끝나면 같은 주문번호(없으면 전부)로 결제 다시 확인을 한 번 부른다", async () => {
    for (const [body, expected] of [
      [{ orderNo: "FC-1" }, "FC-1"],
      [{}, null],
    ] as const) {
      const r = reconcileSpy();
      expect((await runExpiry(fakeClient({ data: COUNTS, error: null }).client, body, r.run)).status).toBe(200);
      expect(r.calls).toEqual([expected]);
    }
  });

  it("INV-M19 (실패경로): 결제 다시 확인에 실패한 줄이 있으면 500 과 건수 — 성공으로 보이지 않는다", async () => {
    const bad = { ok: false, counts: { ...PAYMENTS, errors: 1 } };
    const reply = await runExpiry(fakeClient({ data: COUNTS, error: null }).client, {}, reconcileSpy(bad).run);
    expect(reply.status).toBe(500);
    expect(reply.body).toMatchObject({ counts: COUNTS, payments: bad.counts });
  });

  it("INV-M19 (실패경로): 결제 다시 확인이 예외를 던지면 500", async () => {
    const reply = await runExpiry(fakeClient({ data: COUNTS, error: null }).client, {}, async () => {
      throw new Error("TOSS_SECRET_KEY 가 없다");
    });
    expect(reply.status).toBe(500);
  });
});

describe("지금 돌리기 결과 — 반송 주소 집계 (office-workflow INV-W15)", () => {
  it("INV-W15: 처분 대상으로 바꾼 수(dispose_due)와 재알림 수(return_reminders)를 화면에 넘긴다", async () => {
    const reply = await runExpiry(fakeClient({ data: COUNTS, error: null }).client, {}, reconcileSpy().run);
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ counts: { dispose_due: 2, return_reminders: 3 } });
  });

  it("INV-W15 (실패경로): 두 집계가 빠진 답은 꼴이 다른 답이라 500 — 0건으로 보이지 않는다", async () => {
    for (const drop of ["dispose_due", "return_reminders"] as const) {
      const data: Record<string, number> = { ...COUNTS };
      delete data[drop];
      expect([drop, (await runExpiry(fakeClient({ data, error: null }).client, {}, reconcileSpy().run)).status]).toEqual([drop, 500]);
    }
  });

  it("INV-W15: 결과 한 줄은 운영자 화면 표기 — 「처분 대상 N건 · 재알림 N건」", () => {
    expect(expiryRunSummary({ counts: COUNTS })).toBe("처분 대상 2건 · 재알림 3건");
    expect(expiryRunSummary({ counts: { ...COUNTS, dispose_due: 0, return_reminders: 0 } })).toBe("처분 대상 0건 · 재알림 0건");
  });

  it("INV-W15 (실패경로): 결과의 꼴이 다르면 한 줄을 만들지 않는다(null)", () => {
    for (const body of [{}, { counts: { ...COUNTS, dispose_due: "2" } }, { counts: null }]) expect(expiryRunSummary(body)).toBeNull();
  });
});
