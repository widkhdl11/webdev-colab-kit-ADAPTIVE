import { describe, expect, it } from "vitest";
import { runDispatch } from "./run-dispatch";
import type { DispatchResult } from "./dispatch-notifications";

// 운영자가 「알림 지금 보내기」를 누름 (notifications INV-N5·N10). 정해진 시각마다 부르는 장치는 배포 방식과 함께 정한다(스펙 비범위).

function session(who: { operator: boolean | null }) {
  return { rpc: async (fn: string) => (fn === "is_operator" ? { data: who.operator, error: null } : { data: false, error: null }) } as never;
}

const COUNTS = { sent: 2, skipped: 1, retrying: 0, failed: 0, unfinished: 0, staleResolved: 0, staleUnchecked: 0 };

function dispatcher(result: DispatchResult) {
  const calls: number[] = [];
  return { calls, dispatch: async () => (calls.push(1), result) };
}

describe("알림 지금 보내기 (운영자)", () => {
  it("INV-N5: 운영자면 일꾼을 한 번 돌리고 건수만 돌려준다", async () => {
    const d = dispatcher({ ok: true, counts: COUNTS });
    expect(await runDispatch(session({ operator: true }), {}, d.dispatch)).toEqual({ status: 200, body: { counts: COUNTS } });
    expect(d.calls).toHaveLength(1);
  });

  it("INV-N10 (실패경로): 운영자가 아니면 404 — 일꾼을 돌리지 않는다", async () => {
    for (const operator of [false, null]) {
      const d = dispatcher({ ok: true, counts: COUNTS });
      expect((await runDispatch(session({ operator }), {}, d.dispatch)).status).toBe(404);
      expect(d.calls).toHaveLength(0);
    }
  });

  it("(실패경로): 모르는 칸이 있으면 400 — 받는 사람·통로를 고르는 칸은 없다", async () => {
    for (const body of [null, { to: "a@example.com" }, { channel: "email" }, { accountId: "x" }]) {
      const d = dispatcher({ ok: true, counts: COUNTS });
      expect((await runDispatch(session({ operator: true }), body, d.dispatch)).status).toBe(400);
      expect(d.calls).toHaveLength(0);
    }
  });

  it("INV-N11: 설정 오류·DB 오류는 500 과 사람 말 — 설정 값이나 오류 문장은 응답에 넣지 않는다", async () => {
    const config = await runDispatch(session({ operator: true }), {}, dispatcher({ ok: false, reason: "config", counts: COUNTS }).dispatch);
    expect(config.status).toBe(500);
    expect(config.body.message).toMatch(/설정/);
    const db = await runDispatch(session({ operator: true }), {}, dispatcher({ ok: false, reason: "db", counts: COUNTS }).dispatch);
    expect(db.status).toBe(500);
    expect(db.body.message).not.toMatch(/설정/);
    // 멈추기 전까지 보낸 건수는 같이 준다
    expect(db.body.counts).toEqual(COUNTS);
  });
});
