import { describe, expect, it } from "vitest";
import { emptyCounts, type DispatchResult } from "./dispatch-notifications";
import { runScheduledDispatch } from "./run-scheduled-dispatch";

// 예약 발송 입구 (notifications INV-N16). DB 예약 작업이 5분마다 부른다. 로그인 대신 서버 설정의 비밀 값이 머리에 같이 와야 일한다.

const SECRET = "s".repeat(40);
const ok: DispatchResult = { ok: true, counts: { ...emptyCounts(), sent: 2 } };

function spy() {
  let calls = 0;
  return {
    dispatch: async () => {
      calls += 1;
      return ok;
    },
    calls: () => calls,
  };
}

describe("INV-N16: 예약 발송 입구", () => {
  it("INV-N16 (S16): 서버 비밀 값과 같은 Bearer 값이면 일꾼을 한 번 돌리고 건수만 준다", async () => {
    const s = spy();
    const r = await runScheduledDispatch({ secret: SECRET, authorization: `Bearer ${SECRET}`, body: {} }, s.dispatch);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ counts: ok.counts });
    expect(s.calls()).toBe(1);
  });

  it("INV-N16 (S16b, 실패경로): 머리 없음·틀린 값·길이만 다른 값·Bearer 아닌 꼴은 401 — 일꾼을 부르지 않는다", async () => {
    const s = spy();
    for (const authorization of [null, "Bearer wrong", `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(1)}`, SECRET, `Basic ${SECRET}`]) {
      expect((await runScheduledDispatch({ secret: SECRET, authorization, body: {} }, s.dispatch)).status).toBe(401);
    }
    expect(s.calls()).toBe(0);
  });

  it("INV-N16 (S16b, 실패경로): 서버 비밀 값이 없거나 32자보다 짧으면 404 — 어떤 값을 보내도 일꾼을 부르지 않는다", async () => {
    const s = spy();
    for (const secret of [undefined, "", "s".repeat(31)]) {
      const r = await runScheduledDispatch({ secret, authorization: `Bearer ${secret ?? ""}`, body: {} }, s.dispatch);
      expect(r.status).toBe(404);
    }
    expect(s.calls()).toBe(0);
  });

  it("INV-N16 (실패경로): 본문에 칸이 있으면 400 — 받는 사람·통로를 고르는 칸은 받지 않는다", async () => {
    const s = spy();
    const r = await runScheduledDispatch({ secret: SECRET, authorization: `Bearer ${SECRET}`, body: { accountId: "x" } }, s.dispatch);
    expect(r.status).toBe(400);
    expect(s.calls()).toBe(0);
  });

  it("INV-N16 (실패경로): 본문이 JSON 이 아니면(경로가 null 로 넘김) 400", async () => {
    const s = spy();
    expect((await runScheduledDispatch({ secret: SECRET, authorization: `Bearer ${SECRET}`, body: null }, s.dispatch)).status).toBe(400);
    expect(s.calls()).toBe(0);
  });

  it("INV-N16: 일꾼이 중간에 멈추면 500 과 그때까지의 건수", async () => {
    const r = await runScheduledDispatch({ secret: SECRET, authorization: `Bearer ${SECRET}`, body: {} }, async () => ({ ok: false, reason: "db", counts: ok.counts }));
    expect(r.status).toBe(500);
    expect(r.body).toMatchObject({ counts: ok.counts });
  });
});
