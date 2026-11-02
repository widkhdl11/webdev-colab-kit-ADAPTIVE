import { describe, expect, it } from "vitest";
import { cancelApproval } from "./cancel-approval";

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;

function fakeAdmin(data: unknown) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data, error: null };
      },
    } as never,
  };
}

const row = (result: string, phase: string | null = null) => [{ result, phase }];

describe("승인 취소 저장 (approval-cancel)", () => {
  it("INV-AC5·INV-AC1: 세션의 사람 ID 와 승인 요청 ID 만 넘긴다 — 본문의 사람·도착 상자 수·입고 여부는 넘기지 않는다", async () => {
    const f = fakeAdmin(row("canceled", "before_inbound"));
    const r = await cancelApproval(
      { admin: f.admin, viewer: HARU },
      { requestId: "apr_FCA", actorId: "someone-else", arrivedBoxCount: 0, phase: "before_inbound", p_actor_id: "x" },
    );
    expect(r).toEqual({ ok: true, phase: "before_inbound" });
    expect(f.calls).toEqual([{ fn: "cancel_approval", args: { p_actor_id: HARU.userId, p_request_id: "apr_FCA" } }]);
  });

  it("INV-AC1: 입고 뒤 결과는 서버가 정한 그대로 돌려준다", async () => {
    const f = fakeAdmin(row("canceled", "after_inbound"));
    expect(await cancelApproval({ admin: f.admin, viewer: HARU }, { requestId: "apr_FCA" })).toEqual({ ok: true, phase: "after_inbound" });
  });

  it("INV-AC5 (실패경로): 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeAdmin(row("canceled", "before_inbound"));
      expect(await cancelApproval({ admin: f.admin, viewer }, { requestId: "apr_FCA" })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("형식이 다르면 400 — DB 를 부르지 않는다", async () => {
    for (const body of [{ requestId: "FC-A" }, {}, null, "apr_FCA", { requestId: "apr_FC-A" }]) {
      const f = fakeAdmin(row("canceled", "before_inbound"));
      expect(await cancelApproval({ admin: f.admin, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-AC4·AC5 (실패경로): 없는 요청 404, 승인 상태 아님 409, 송장 출력 뒤 409(code printed), 진행이 끝난 주문 409", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["not_found", { ok: false, status: 404 }],
      ["not_approved", { ok: false, status: 409 }],
      ["printed", { ok: false, status: 409, code: "printed", message: "송장이 이미 출력돼 승인을 취소할 수 없습니다. 1:1 문의로 알려 주세요." }],
      ["not_cancelable", { ok: false, status: 409 }],
    ];
    for (const [result, expected] of cases) {
      const f = fakeAdmin(row(result));
      expect(await cancelApproval({ admin: f.admin, viewer: HARU }, { requestId: "apr_FCA" })).toMatchObject(expected);
    }
  });

  it("모르는 결과·입고 전/뒤 없는 성공은 성공으로 치지 않고 던진다", async () => {
    await expect(cancelApproval({ admin: fakeAdmin(row("weird")).admin, viewer: HARU }, { requestId: "apr_FCA" })).rejects.toThrow();
    await expect(cancelApproval({ admin: fakeAdmin(row("canceled", null)).admin, viewer: HARU }, { requestId: "apr_FCA" })).rejects.toThrow();
    await expect(cancelApproval({ admin: fakeAdmin(row("canceled", "inbound")).admin, viewer: HARU }, { requestId: "apr_FCA" })).rejects.toThrow();
  });
});
