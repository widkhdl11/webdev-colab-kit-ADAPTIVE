import { describe, expect, it } from "vitest";
import { cancelOutcome } from "@/shared/api/toss-payments/cancel-outcome";
import { runRefund, type RefundDeps } from "./run-refund";

// 환불 실행 (admin-console INV-K2·K7, payment INV-M9). DB 는 가짜로 세우고 결제사 호출은 기록만 한다 —
// 시험 대상은 runRefund 의 순서·판정이다(대표 확인 → 잡기 → 결제사 취소 한 번 → 결과 기록).

const UNIT = "00000000-0000-4000-a000-0000000000aa";
const REFUND_ID = "11111111-1111-4111-a111-111111111111";
const KEY = "tgen_pk_1";

type RpcCall = { fn: string; args: unknown };

function fakeClient(answers: Record<string, { data: unknown; error: { code: string } | null }>) {
  const calls: RpcCall[] = [];
  return {
    calls,
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      return answers[fn] ?? { data: null, error: { code: "XX000" } };
    },
  };
}

function ownerSession(claim: { data: unknown; error: { code: string } | null } = { data: [{ refund_id: REFUND_ID, payment_key: KEY, amount_krw: 6900 }], error: null }) {
  return fakeClient({
    is_operator: { data: true, error: null },
    is_owner: { data: true, error: null },
    admin_claim_refund: claim,
  });
}

function canceled(amount = 6900, status = "CANCELED") {
  return { paymentKey: KEY, status, cancels: [{ cancelAmount: amount, cancelStatus: "DONE", transactionKey: "t1" }] };
}

function setup(opts: { session?: ReturnType<typeof fakeClient>; toss?: () => Promise<unknown>; settle?: { data: unknown; error: { code: string } | null } } = {}) {
  const session = opts.session ?? ownerSession();
  const admin = fakeClient({ settle_refund: opts.settle ?? { data: true, error: null } });
  const cancels: unknown[] = [];
  const toss = {
    cancel: async (req: unknown) => {
      cancels.push(req);
      return opts.toss ? opts.toss() : canceled();
    },
  };
  const deps = { session, admin, toss } as unknown as RefundDeps;
  return { deps, session, admin, cancels };
}

const body = { kind: "gift", unitId: UNIT };

describe("INV-K1 · INV-K2: 환불은 대표만", () => {
  it("INV-K1 (실패경로): 운영자가 아니면 404 이고 잡기·결제사 호출이 없다", async () => {
    const session = fakeClient({ is_operator: { data: false, error: null } });
    const s = setup({ session });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(404);
    expect(session.calls.map((c) => c.fn)).toEqual(["is_operator"]);
    expect(s.cancels).toHaveLength(0);
  });

  it("INV-K7 S7c (실패경로): 직원 운영자는 403 이고 잡기·결제사 호출이 없다", async () => {
    const session = fakeClient({ is_operator: { data: true, error: null }, is_owner: { data: false, error: null } });
    const s = setup({ session });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(403);
    expect(session.calls.some((c) => c.fn === "admin_claim_refund")).toBe(false);
    expect(s.cancels).toHaveLength(0);
  });

  it("INV-K2: 화면이 대표라고 말해도 DB 가 대표가 아니라고 하면(42501) 403 — 결제사 호출 없음", async () => {
    const s = setup({ session: ownerSession({ data: null, error: { code: "42501" } }) });
    expect((await runRefund(s.deps, body)).status).toBe(403);
    expect(s.cancels).toHaveLength(0);
  });
});

describe("INV-K7: 화면은 금액을 보내지 않는다", () => {
  it("INV-K7 (실패경로): 몸통에 금액 칸이 있으면 400 — 잡기도 하지 않는다", async () => {
    const s = setup();
    const reply = await runRefund(s.deps, { ...body, amountKrw: 1 });
    expect(reply.status).toBe(400);
    expect(s.session.calls.some((c) => c.fn === "admin_claim_refund")).toBe(false);
  });

  it("종류가 gift·revgift 가 아니거나 ID 꼴이 아니면 400", async () => {
    for (const bad of [{ kind: "other", unitId: UNIT }, { kind: "gift", unitId: "1" }, null, "x"]) {
      expect((await runRefund(setup().deps, bad)).status).toBe(400);
    }
  });

  it("INV-K7: 잡기에는 종류와 ID 만 넘긴다", async () => {
    const s = setup();
    await runRefund(s.deps, { kind: "revgift", unitId: UNIT });
    expect(s.session.calls.find((c) => c.fn === "admin_claim_refund")?.args).toEqual({ p_kind: "revgift", p_unit_id: UNIT });
  });
});

describe("INV-K7 · INV-M9: 결제사 취소는 한 번, 멱등 키 = 환불 기록 ID", () => {
  it("INV-M9: 닫힌 상자의 환불(gift_box)도 종류와 상자 ID 만 넘긴다", async () => {
    const s = setup();
    await runRefund(s.deps, { kind: "gift_box", unitId: UNIT });
    expect(s.session.calls.find((c) => c.fn === "admin_claim_refund")?.args).toEqual({ p_kind: "gift_box", p_unit_id: UNIT });
  });

  it("INV-K7 S7: 잡히면 결제사 취소를 한 번 — DB 가 정한 금액·결제 키·환불 기록 ID 로", async () => {
    const s = setup();
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({ ok: true, refundKrw: 6900 });
    expect(s.cancels).toEqual([{ paymentKey: KEY, cancelAmount: 6900, cancelReason: "팬꾹 환불", idempotencyKey: REFUND_ID }]);
    expect(s.admin.calls).toEqual([{ fn: "settle_refund", args: { p_refund_id: REFUND_ID, p_ok: true, p_error: null } }]);
  });

  it("INV-M9 S9 (실패경로): 이미 환불한 것(P0023)이면 409 이고 결제사 호출이 없다", async () => {
    const s = setup({ session: ownerSession({ data: null, error: { code: "P0023" } }) });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(409);
    expect(reply.body.message).toBe("이미 환불했어요.");
    expect(s.cancels).toHaveLength(0);
  });

  it("INV-K7 S7b (실패경로): 처리 중(P0024)이면 409 이고 결제사 호출이 없다", async () => {
    const s = setup({ session: ownerSession({ data: null, error: { code: "P0024" } }) });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(409);
    expect(reply.body.message).toMatch(/처리하고 있어요/);
    expect(s.cancels).toHaveLength(0);
  });

  it("환불할 수 없는 상태(P0022)는 409, 없는 것(P0002)은 404, 그 밖의 DB 오류는 500 — 모두 결제사 호출 없음", async () => {
    for (const [code, status] of [["P0022", 409], ["P0002", 404], ["XX000", 500]] as const) {
      const s = setup({ session: ownerSession({ data: null, error: { code } }) });
      expect((await runRefund(s.deps, body)).status).toBe(status);
      expect(s.cancels).toHaveLength(0);
    }
  });

  it("잡기 응답 모양이 다르면 500 이고 결제사 호출이 없다", async () => {
    const s = setup({ session: ownerSession({ data: [{ refund_id: "x", payment_key: KEY, amount_krw: 6900 }], error: null }) });
    expect((await runRefund(s.deps, body)).status).toBe(500);
    expect(s.cancels).toHaveLength(0);
  });
});

describe("INV-K7: 결제사 취소가 실패하면 「실패」로 남는다", () => {
  it("INV-K7 (실패경로): 결제사가 오류를 돌려주면 실패로 기록하고 502 — 오류 코드를 남긴다", async () => {
    const s = setup({ toss: async () => ({ code: "NOT_CANCELABLE_AMOUNT", message: "취소 할 수 없는 금액 입니다." }) });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(502);
    expect(s.admin.calls[0]?.args).toEqual({ p_refund_id: REFUND_ID, p_ok: false, p_error: "NOT_CANCELABLE_AMOUNT 취소 할 수 없는 금액 입니다." });
  });

  it("INV-K7 (실패경로): 결제사 호출이 응답 없이 끊기면 실패로 기록하고 502", async () => {
    const s = setup({
      toss: async () => {
        throw new Error("network");
      },
    });
    expect((await runRefund(s.deps, body)).status).toBe(502);
    expect(s.admin.calls[0]?.args).toMatchObject({ p_ok: false });
  });

  it("결과를 기록하지 못하면 500 — 기록은 「처리 중」으로 남아 2분 뒤 같은 키로 다시 할 수 있다고 알린다", async () => {
    const s = setup({ settle: { data: null, error: { code: "XX000" } } });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(500);
    expect(reply.body.message).toMatch(/2분 뒤/);
    expect(s.cancels).toHaveLength(1);
  });

  it("INV-K7 (실패경로): 다른 요청이 먼저 결과를 남겼으면(기록이 이미 처리 중이 아님) 성공이라고 답하지 않는다 — 409", async () => {
    const s = setup({ settle: { data: false, error: null } });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(409);
    expect(reply.body.ok).toBeUndefined();
  });

  it("INV-M9 (실패경로): 다시 시도 기한(14일)이 지난 기록(P0025)은 409 이고 결제사 호출이 없다", async () => {
    const s = setup({ session: ownerSession({ data: null, error: { code: "P0025" } }) });
    const reply = await runRefund(s.deps, body);
    expect(reply.status).toBe(409);
    expect(reply.body.message).toMatch(/14일/);
    expect(s.cancels).toHaveLength(0);
  });
});

describe("cancelOutcome: 결제사 응답이 이 환불의 성공인가", () => {
  it("결제 키가 같고 취소 상태이며 이 금액의 취소 완료 줄이 있으면 성공 — 부분 취소도", () => {
    expect(cancelOutcome(canceled(), KEY, 6900)).toEqual({ ok: true });
    expect(cancelOutcome(canceled(1400, "PARTIAL_CANCELED"), KEY, 1400)).toEqual({ ok: true });
  });

  it("(실패경로) 다른 결제의 응답이면 실패", () => {
    expect(cancelOutcome({ ...canceled(), paymentKey: "other" }, KEY, 6900).ok).toBe(false);
  });

  it("(실패경로) 취소 상태가 아니면 실패", () => {
    expect(cancelOutcome(canceled(6900, "DONE"), KEY, 6900).ok).toBe(false);
  });

  it("(실패경로) 마지막 취소 줄이 이 환불의 것이어야 한다 — 같은 결제의 앞선 다른 몫 취소 줄로는 성공이 아니다", () => {
    const two = { paymentKey: KEY, status: "PARTIAL_CANCELED", cancels: [
      { cancelAmount: 5400, cancelStatus: "DONE", canceledAt: "2026-10-04T10:00:00+09:00" },
      { cancelAmount: 1400, cancelStatus: "DONE", canceledAt: "2026-10-04T11:00:00+09:00" },
    ] };
    expect(cancelOutcome(two, KEY, 5400).ok).toBe(false);
    expect(cancelOutcome(two, KEY, 1400)).toEqual({ ok: true });
    // 배열 순서가 시각 순서와 달라도 시각으로 고른다
    expect(cancelOutcome({ ...two, cancels: [...two.cancels].reverse() }, KEY, 1400)).toEqual({ ok: true });
  });

  it("(실패경로) 이 금액의 취소 완료 줄이 없으면 실패", () => {
    expect(cancelOutcome(canceled(5400), KEY, 6900).ok).toBe(false);
    expect(cancelOutcome({ ...canceled(), cancels: [{ cancelAmount: 6900, cancelStatus: "WAITING" }] }, KEY, 6900).ok).toBe(false);
    expect(cancelOutcome({ ...canceled(), cancels: null }, KEY, 6900).ok).toBe(false);
  });

  it("(실패경로) 오류 응답은 코드와 문구를 200자 안으로 남긴다", () => {
    const out = cancelOutcome({ code: "X", message: "가".repeat(400) }, KEY, 6900);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.length).toBeLessThanOrEqual(200);
  });

  it("(실패경로) 알 수 없는 모양이면 실패", () => {
    for (const v of [null, "x", 1, {}]) expect(cancelOutcome(v, KEY, 6900).ok).toBe(false);
  });
});
