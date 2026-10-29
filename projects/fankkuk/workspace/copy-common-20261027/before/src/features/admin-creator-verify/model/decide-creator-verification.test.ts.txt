import { describe, expect, it } from "vitest";
import { decideCreatorVerification } from "./decide-creator-verification";

const APP = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const CREATOR = "7a1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

type Who = { operator: boolean; owner: boolean };

function fakeClient(error: { code: string } | null, who: Who = { operator: true, owner: false }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: null, error };
    },
  } as never;
  return { calls, client };
}

describe("운영자의 본인 확인 처리 (creator-verification INV-V6·V9·V10·V15, INV-K10)", () => {
  it("INV-V6: 승인은 신청 식별값 하나만 DB 승인 함수에 넘긴다 — 크리에이터 식별값으로 바로 확인됨을 켜는 길은 없다", async () => {
    const { calls, client } = fakeClient(null);
    expect(await decideCreatorVerification(client, { action: "approve", applicationId: APP })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_approve_creator_verification", args: { p_application_id: APP } }]);
    const direct = fakeClient(null);
    expect((await decideCreatorVerification(direct.client, { action: "approve", creatorId: CREATOR })).status).toBe(400);
    expect((await decideCreatorVerification(direct.client, { action: "approve", applicationId: APP, verified: true })).status).toBe(400);
    expect(direct.calls).toEqual([]);
  });

  it("INV-V9: 반려는 사유 목록 값 + 메모(앞뒤 공백 뗌)로 간다", async () => {
    const { calls, client } = fakeClient(null);
    const r = await decideCreatorVerification(client, { action: "reject", applicationId: APP, reasonCode: "code_not_found", memo: "  다른 계정과 대조 " });
    expect(r.status).toBe(200);
    expect(calls).toEqual([
      { fn: "admin_reject_creator_verification", args: { p_application_id: APP, p_reason_code: "code_not_found", p_memo: "다른 계정과 대조" } },
    ]);
  });

  it("INV-V9·V10: 승인 취소는 취소 사유 목록 값 + 메모로 admin_revoke_creator 를 부른다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await decideCreatorVerification(client, { action: "revoke", creatorId: CREATOR, reasonCode: "channel_gone", memo: "" })).status).toBe(200);
    expect(calls).toEqual([{ fn: "admin_revoke_creator", args: { p_creator_id: CREATOR, p_reason_code: "channel_gone", p_memo: "" } }]);
  });

  it("INV-V15: 횟수 풀기는 신청 식별값과 메모로", async () => {
    const { calls, client } = fakeClient(null);
    expect((await decideCreatorVerification(client, { action: "unlock", applicationId: APP, memo: "문의 #12 확인" })).status).toBe(200);
    expect(calls).toEqual([{ fn: "admin_unlock_creator_verification_count", args: { p_application_id: APP, p_memo: "문의 #12 확인" } }]);
  });

  it("INV-V9 (실패경로): 사유가 없거나 목록 밖 값이면, 반려 사유를 취소에 쓰면, 메모가 200자를 넘으면 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { action: "reject", applicationId: APP, memo: "" },
      { action: "reject", applicationId: APP, reasonCode: "not_owner", memo: "" },
      { action: "revoke", creatorId: CREATOR, reasonCode: "code_not_found", memo: "" },
      { action: "reject", applicationId: APP, reasonCode: "channel_gone", memo: "" },
      // 2026-10-06 취소 사유에서 뺀 값 — 화면도 보내지 않는다
      { action: "revoke", creatorId: CREATOR, reasonCode: "code_removed", memo: "" },
      { action: "reject", applicationId: APP, reasonCode: "other", memo: "가".repeat(201) },
      { action: "unlock", applicationId: APP, memo: "가".repeat(201) },
      { action: "unlock", applicationId: "x", memo: "" },
      { action: "set", creatorId: CREATOR, verified: true },
      { creatorId: CREATOR, verified: true, reason: "" }, // 옛 화면의 본문
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient(null);
      expect((await decideCreatorVerification(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-V9: 메모 200자는 받는다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await decideCreatorVerification(client, { action: "reject", applicationId: APP, reasonCode: "other", memo: "가".repeat(200) })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-V6 (실패경로): 운영자가 아니면 404 — DB 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient(null, { operator: false, owner: false });
    expect(await decideCreatorVerification(client, { action: "approve", applicationId: APP })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-V6 (실패경로): 이미 처리됨(55000)이면 409 「이미 처리됐어요. 새로 고침해 주세요.」, 42501→403, P0002→404, 22023→400", async () => {
    const already = fakeClient({ code: "55000" });
    expect(await decideCreatorVerification(already.client, { action: "approve", applicationId: APP })).toEqual({
      status: 409,
      body: { message: "이미 처리됐어요. 새로 고침해 주세요." },
    });
    for (const [code, status] of [
      ["42501", 403],
      ["P0002", 404],
      ["22023", 400],
      ["XX000", 500],
    ] as const) {
      const { client } = fakeClient({ code });
      expect((await decideCreatorVerification(client, { action: "approve", applicationId: APP })).status).toBe(status);
    }
  });
});
