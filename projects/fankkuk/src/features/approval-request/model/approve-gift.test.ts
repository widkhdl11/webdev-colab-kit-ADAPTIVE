import { describe, expect, it } from "vitest";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { approveGift } from "./approve-gift";

const HARU = { userId: "creator-haru", role: "creator" } as const;
const PAYLOAD = "fankkuk-approval:v1|req=apr_FCA|order=FC-7K3M9|at=2026-10-05T00:00:00.000Z|fan=4e5ce0107d7f6371700f9b147ecd1588297165312c62f9b901754db47613f58a";
const signer = chooseApprovalSigner({ NODE_ENV: "test" });

function fakeAdmin(payload: string | null, result: unknown = "approved") {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data: fn === "approval_payload_of" ? payload : result, error: null };
      },
    } as never,
  };
}

describe("승인 저장 (approval-signature INV-S11·S12)", () => {
  it("INV-S11: 로그인한 크리에이터로 원문을 읽고, 가짜 서명을 붙여 승인 함수를 부른다 — 본문의 사람·서명 칸은 쓰지 않는다", async () => {
    const f = fakeAdmin(PAYLOAD);
    const r = await approveGift(
      { admin: f.admin, viewer: HARU, signer },
      { requestId: "apr_FCA", actorId: "someone", signerId: "fake:someone", signedContent: "x" },
    );
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "approval_payload_of", args: { p_request_id: "apr_FCA", p_actor_id: "creator-haru" } },
      {
        fn: "approve_request",
        args: { p_request_id: "apr_FCA", p_actor_id: "creator-haru", p_signed_content: PAYLOAD, p_signer_id: "fake:creator-haru", p_method: "fake" },
      },
    ]);
  });

  it("INV-S11: 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeAdmin(PAYLOAD);
      expect(await approveGift({ admin: f.admin, viewer, signer }, { requestId: "apr_FCA" })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-S11 S11c: 서명 창구가 없으면(운영) 503 — DB 를 부르지 않는다", async () => {
    const f = fakeAdmin(PAYLOAD);
    expect(await approveGift({ admin: f.admin, viewer: HARU, signer: null }, { requestId: "apr_FCA" })).toMatchObject({ ok: false, status: 503 });
    expect(f.calls).toEqual([]);
  });

  it("INV-S11 S11b: 남의 요청·없는 요청은 원문이 안 나와 404 하나로 — 승인 함수를 부르지 않는다", async () => {
    const f = fakeAdmin(null);
    expect(await approveGift({ admin: f.admin, viewer: HARU, signer }, { requestId: "apr_FCA" })).toEqual({
      ok: false,
      status: 404,
      message: "찾을 수 없는 요청이에요.",
    });
    expect(f.calls.map((c) => c.fn)).toEqual(["approval_payload_of"]);
  });

  it("INV-S2·S4: 창구가 돌려준 서명의 원문이 다르거나 서명자가 등록값과 다르면 409 — 승인 함수를 부르지 않는다", async () => {
    const enc = (t: string) => new TextEncoder().encode(t);
    for (const bad of [
      { signedContent: enc(`${PAYLOAD} `), signerId: "fake:creator-haru" },
      { signedContent: enc(PAYLOAD), signerId: "fake:someone-else" },
    ]) {
      const wrong = { kind: "fake" as const, sign: async () => bad, registeredSignerIdOf: (id: string) => `fake:${id}` };
      const f = fakeAdmin(PAYLOAD);
      expect(await approveGift({ admin: f.admin, viewer: HARU, signer: wrong }, { requestId: "apr_FCA" })).toMatchObject({ ok: false, status: 409 });
      expect(f.calls.map((c) => c.fn)).toEqual(["approval_payload_of"]);
    }
  });

  it("형식이 다르면 400", async () => {
    for (const body of [{ requestId: "FC-A" }, {}, null, "apr_FCA"]) {
      const f = fakeAdmin(PAYLOAD);
      expect(await approveGift({ admin: f.admin, viewer: HARU, signer }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-S6 S6c (실패경로): 168시간이 지난 요청은 409 「기간이 지나 자동으로 반려된 선물이에요」", async () => {
    expect(await approveGift({ admin: fakeAdmin(PAYLOAD, "expired").admin, viewer: HARU, signer }, { requestId: "apr_FCA" })).toEqual({
      ok: false,
      status: 409,
      message: "기간이 지나 자동으로 반려된 선물이에요.",
    });
  });

  it("DB 결과를 문구로 — 이미 처리됨·승인 불가·서명 불일치는 409, 모르는 결과는 던진다", async () => {
    for (const [result, status] of [
      ["already", 409],
      ["not_approvable", 409],
      ["signature_mismatch", 409],
      ["not_found", 404],
    ] as const) {
      expect(await approveGift({ admin: fakeAdmin(PAYLOAD, result).admin, viewer: HARU, signer }, { requestId: "apr_FCA" })).toMatchObject({
        ok: false,
        status,
      });
    }
    await expect(approveGift({ admin: fakeAdmin(PAYLOAD, "weird").admin, viewer: HARU, signer }, { requestId: "apr_FCA" })).rejects.toThrow();
  });
});
