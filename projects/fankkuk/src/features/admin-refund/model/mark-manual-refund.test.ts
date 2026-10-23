import { describe, expect, it } from "vitest";
import { MANUAL_REFUND_MESSAGE, markManualRefund, type ManualRefundDeps } from "./mark-manual-refund";

// 「직접 환불함」 (admin-console INV-K7 S7d·S7e, 카드 d126). DB 는 가짜로 세운다 — 판정(대표·상태·메모·잠금)은 DB 함수가 하고
// 통합 시험(admin-refund-manual)이 본다. 여기서는 순서(운영자 확인 → 입력 모양 → DB 함수 한 번)와 거절 문장만.

const UNIT = "00000000-0000-4000-a000-0000000000aa";

function fakeSession(answers: Record<string, { data: unknown; error: { code: string } | null }>) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      return answers[fn] ?? { data: null, error: { code: "XX000" } };
    },
  };
}

function owner(mark: { data: unknown; error: { code: string } | null } = { data: 6900, error: null }) {
  return fakeSession({ is_operator: { data: true, error: null }, is_owner: { data: true, error: null }, admin_mark_refund_manual: mark });
}

const run = (session: ReturnType<typeof fakeSession>, body: unknown) => markManualRefund({ session } as unknown as ManualRefundDeps, body);
const body = { kind: "gift", unitId: UNIT, memo: "2026-10-24 결제사 관리 화면에서 취소" };

describe("INV-K7 (S7d): 직접 환불함", () => {
  it("INV-K7 (S7d): 대표가 보내면 DB 함수를 한 번 부르고 기록된 금액을 돌려준다 — 메모는 그대로 넘긴다", async () => {
    const s = owner();
    expect(await run(s, body)).toEqual({ status: 200, body: { ok: true, refundKrw: 6900 } });
    expect(s.calls.filter((c) => c.fn === "admin_mark_refund_manual")).toEqual([
      { fn: "admin_mark_refund_manual", args: { p_kind: "gift", p_unit_id: UNIT, p_memo: body.memo } },
    ]);
  });

  it("INV-K7 (S7e, 실패경로): 운영자가 아니면 404 · 직원이면 403 — DB 함수를 부르지 않는다", async () => {
    const stranger = fakeSession({ is_operator: { data: false, error: null } });
    expect((await run(stranger, body)).status).toBe(404);
    const staff = fakeSession({ is_operator: { data: true, error: null }, is_owner: { data: false, error: null } });
    expect(await run(staff, body)).toEqual({ status: 403, body: { message: MANUAL_REFUND_MESSAGE.ownerOnly } });
    for (const s of [stranger, staff]) expect(s.calls.some((c) => c.fn === "admin_mark_refund_manual")).toBe(false);
  });

  it("INV-K7 (S7e, 실패경로): 금액 칸이 섞여 오거나 종류·단위·메모 모양이 틀리면 400 — DB 함수를 부르지 않는다", async () => {
    for (const bad of [
      { ...body, amountKrw: 1 },
      { ...body, kind: "card" },
      { ...body, unitId: "x" },
      { kind: "gift", unitId: UNIT },
      { ...body, memo: 3 },
      { ...body, memo: "가".repeat(1001) },
    ]) {
      const s = owner();
      expect((await run(s, bad)).status).toBe(400);
      expect(s.calls.some((c) => c.fn === "admin_mark_refund_manual")).toBe(false);
    }
  });

  it("INV-K7 (S7e, 실패경로): DB 거절을 문장으로 — 메모 길이·숫자(메모 칸 표시)·누르기 전·이미 완료·처리 중·없음·대표 아님 · 그 밖 500", async () => {
    const cases: [string, number, string][] = [
      ["P0026", 400, MANUAL_REFUND_MESSAGE.memoLength],
      ["P0027", 400, MANUAL_REFUND_MESSAGE.memoDigits],
      ["P0022", 409, MANUAL_REFUND_MESSAGE.notClaimed],
      ["P0023", 409, MANUAL_REFUND_MESSAGE.alreadyDone],
      ["P0024", 409, MANUAL_REFUND_MESSAGE.inProgress],
      ["P0002", 404, MANUAL_REFUND_MESSAGE.notFound],
      ["42501", 403, MANUAL_REFUND_MESSAGE.ownerOnly],
      ["XX000", 500, MANUAL_REFUND_MESSAGE.failed],
    ];
    for (const [code, status, message] of cases) {
      const field = code === "P0026" || code === "P0027" ? { field: "memo" } : {};
      expect(await run(owner({ data: null, error: { code } }), body)).toEqual({ status, body: { message, ...field } });
    }
  });

  it("INV-K7 (실패경로): DB 가 금액이 아닌 값을 돌려주면 성공이라고 말하지 않는다(500)", async () => {
    expect((await run(owner({ data: "6900", error: null }), body)).status).toBe(500);
  });
});
