import { describe, expect, it } from "vitest";
import type { ReconcileResult } from "./reconcile-payments";
import { runScheduledReconcile } from "./run-scheduled-reconcile";

// 결제 다시 확인 예약 입구 (payment INV-M19 S19g). 알림 예약 입구(notifications INV-N16)와 같은 비밀 값 판정 —
// 비밀 값이 맞지 않으면 결제사 조회(다시 확인 실행)를 부르지 않는다.

const SECRET = "s".repeat(40);
const ok: ReconcileResult = { ok: true, counts: { checked: 1, done: 1, failed: 0, review: 0, kept: 0, errors: 0, skipped: 0 } };

function spy(result: ReconcileResult = ok) {
  const calls: (string | null)[] = [];
  return {
    run: async (orderNo: string | null) => {
      calls.push(orderNo);
      return result;
    },
    calls,
  };
}

describe("INV-M19 (S19g): 결제 다시 확인 예약 입구", () => {
  it("INV-M19 (S19g): 서버 비밀 값과 같은 Bearer 값이면 전부를 한 번 확인하고 건수만 준다", async () => {
    const s = spy();
    const r = await runScheduledReconcile({ secret: SECRET, authorization: `Bearer ${SECRET}`, body: {} }, s.run);
    expect(r).toEqual({ status: 200, body: { counts: ok.counts } });
    expect(s.calls).toEqual([null]);
  });

  it("INV-M19 (S19g, 실패경로): 머리 없음·틀린 값·Bearer 아닌 꼴은 401 — 결제사 조회 없음", async () => {
    const s = spy();
    for (const authorization of [null, "Bearer wrong", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, SECRET, `Basic ${SECRET}`]) {
      expect((await runScheduledReconcile({ secret: SECRET, authorization, body: {} }, s.run)).status).toBe(401);
    }
    expect(s.calls).toEqual([]);
  });

  it("INV-M19 (S19g, 실패경로): 서버 비밀 값이 없거나 32자보다 짧으면 404 — 결제사 조회 없음", async () => {
    const s = spy();
    for (const secret of [undefined, "", "s".repeat(31)]) {
      expect((await runScheduledReconcile({ secret, authorization: `Bearer ${secret ?? ""}`, body: {} }, s.run)).status).toBe(404);
    }
    expect(s.calls).toEqual([]);
  });

  it("INV-M19 (S19g, 실패경로): 본문에 칸이 있거나 JSON 이 아니면 400", async () => {
    const s = spy();
    for (const body of [{ orderNo: "FC-1" }, null]) {
      expect((await runScheduledReconcile({ secret: SECRET, authorization: `Bearer ${SECRET}`, body }, s.run)).status).toBe(400);
    }
    expect(s.calls).toEqual([]);
  });

  it("INV-M19: 실패한 줄이 있으면 500 과 건수", async () => {
    const bad: ReconcileResult = { ok: false, counts: { ...ok.counts, errors: 1 } };
    const r = await runScheduledReconcile({ secret: SECRET, authorization: `Bearer ${SECRET}`, body: {} }, spy(bad).run);
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ counts: bad.counts });
  });
});
