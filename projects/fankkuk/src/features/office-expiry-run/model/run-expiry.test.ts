import { describe, expect, it } from "vitest";
import { runExpiry } from "./run-expiry";

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

const COUNTS = { gifts: 1, unmatched: 0, differences: 0, revgifts: 0, pending_gifts: 0, pending_revgifts: 0, held: 0 };

describe("자동 처리 지금 돌리기 (office-workflow INV-W6)", () => {
  it("INV-W6: 한 줄만 — 주문번호를 넘기고 처리 건수를 돌려준다", async () => {
    const { calls, client } = fakeClient({ data: COUNTS, error: null });
    expect(await runExpiry(client, { orderNo: "FC-260927-0003" })).toEqual({ status: 200, body: { counts: COUNTS } });
    expect(calls).toEqual([{ fn: "office_run_expiry", args: { p_order_no: "FC-260927-0003" } }]);
  });

  it("INV-W6: 주문번호 없이 부르면 전부(null)", async () => {
    const { calls, client } = fakeClient({ data: COUNTS, error: null });
    expect((await runExpiry(client, {})).status).toBe(200);
    expect(calls).toEqual([{ fn: "office_run_expiry", args: { p_order_no: null } }]);
  });

  it("INV-W6 (실패경로): 꼴이 틀린 주문번호·모르는 칸은 DB 를 부르지 않고 400", async () => {
    for (const body of [null, { orderNo: "" }, { orderNo: "FC 1; drop" }, { orderNo: "F".repeat(41) }, { orderNo: "FC-1", force: true }]) {
      const { calls, client } = fakeClient({ data: COUNTS, error: null });
      expect((await runExpiry(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-W6 (실패경로): 운영자가 아니면 404 — 자동 처리 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ data: COUNTS, error: null }, { operator: false, owner: false });
    expect(await runExpiry(client, { orderNo: "FC-1" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-W6 (실패경로): DB 오류는 403·404·500, 답의 꼴이 다르면 500", async () => {
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["XX000", 500],
    ] as const) {
      expect((await runExpiry(fakeClient({ error: { code } }).client, { orderNo: "FC-1" })).status).toBe(status);
    }
    expect((await runExpiry(fakeClient({ data: { gifts: "1" }, error: null }).client, {})).status).toBe(500);
  });
});
