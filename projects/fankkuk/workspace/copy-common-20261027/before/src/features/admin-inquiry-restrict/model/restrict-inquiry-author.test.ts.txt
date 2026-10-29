import { describe, expect, it } from "vitest";
import { restrictInquiryAuthor } from "./restrict-inquiry-author";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

type Who = { operator: boolean; owner: boolean };

function fakeClient(error: { code: string } | null, who: Who = { operator: true, owner: true }) {
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

describe("1:1 문의 제한·풀기 (INV-K12)", () => {
  it("INV-K12: 대표가 제한 — 사유 앞뒤 공백을 떼고 문의 ID 로 DB 함수를 부르고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await restrictInquiryAuthor(client, { id: ID, restricted: true, reason: "  같은 문의 반복 " })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_set_inquiry_restriction", args: { p_inquiry_id: ID, p_restricted: true, p_reason: "같은 문의 반복" } }]);
  });

  it("INV-K12: 풀기도 같은 길 — restricted false", async () => {
    const { calls, client } = fakeClient(null);
    expect((await restrictInquiryAuthor(client, { id: ID, restricted: false, reason: "사과 받음" })).status).toBe(200);
    expect(calls).toEqual([{ fn: "admin_set_inquiry_restriction", args: { p_inquiry_id: ID, p_restricted: false, p_reason: "사과 받음" } }]);
  });

  it("INV-K12 (실패경로): 운영자가 아니면 404, 직원 운영자는 403 — 둘 다 DB 함수를 부르지 않는다", async () => {
    const guest = fakeClient(null, { operator: false, owner: false });
    expect(await restrictInquiryAuthor(guest.client, { id: ID, restricted: true, reason: "x" })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(guest.calls).toEqual([]);
    const staff = fakeClient(null, { operator: true, owner: false });
    expect(await restrictInquiryAuthor(staff.client, { id: ID, restricted: true, reason: "x" })).toEqual({
      status: 403,
      body: { message: "문의 제한은 대표만 할 수 있어요." },
    });
    expect(staff.calls).toEqual([]);
  });

  it("INV-K12 (실패경로): 사유 빈칸·공백만·201자, 꼴이 틀린 몸통은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { id: ID, restricted: true, reason: "" },
      { id: ID, restricted: true, reason: "   " },
      { id: ID, restricted: true, reason: "가".repeat(201) },
      { id: ID, restricted: "yes", reason: "x" },
      { id: "x", restricted: true, reason: "x" },
      { id: ID, reason: "x" },
      { id: ID, restricted: true, reason: "x", accountId: ID },
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient(null);
      expect(await restrictInquiryAuthor(client, body)).toEqual({ status: 400, body: { message: "사유를 1~200자로 적어 주세요." } });
      expect(calls).toEqual([]);
    }
  });

  it("INV-K12: 사유 200자는 받는다", async () => {
    const { calls, client } = fakeClient(null);
    expect((await restrictInquiryAuthor(client, { id: ID, restricted: true, reason: "가".repeat(200) })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-K12 (실패경로): DB 오류 — P0052 운영자 계정 400, 22023 사유 400, 55000 이미 그 상태 409, 42501 403, P0002 404, 그 밖 500", async () => {
    const body = { id: ID, restricted: true, reason: "x" };
    expect(await restrictInquiryAuthor(fakeClient({ code: "P0052" }).client, body)).toEqual({ status: 400, body: { message: "운영자 계정은 제한할 수 없어요." } });
    expect(await restrictInquiryAuthor(fakeClient({ code: "22023" }).client, body)).toEqual({ status: 400, body: { message: "사유를 1~200자로 적어 주세요." } });
    expect(await restrictInquiryAuthor(fakeClient({ code: "55000" }).client, body)).toEqual({ status: 409, body: { message: "이미 바뀌었어요. 새로 고침해 주세요." } });
    // 앱이 대표로 본 뒤 DB 가 거부(그 사이 대표가 바뀜)해도 같은 문구
    expect(await restrictInquiryAuthor(fakeClient({ code: "42501" }).client, body)).toEqual({ status: 403, body: { message: "문의 제한은 대표만 할 수 있어요." } });
    expect((await restrictInquiryAuthor(fakeClient({ code: "P0002" }).client, body)).status).toBe(404);
    expect((await restrictInquiryAuthor(fakeClient({ code: "XX000" }).client, body)).status).toBe(500);
  });
});
