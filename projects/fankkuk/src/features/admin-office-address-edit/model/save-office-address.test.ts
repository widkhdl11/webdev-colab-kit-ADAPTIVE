import { describe, expect, it } from "vitest";
import { OFFICE_ADDRESS_MESSAGE, saveOfficeAddress } from "./save-office-address";

// 팬꾹 주소 저장 응답 (admin-console INV-K19 ①②). DB 판정 자체는 통합 시험(tests/integration/admin-office-address-db)이 본다 —
// 여기서는 대표만·값 검사를 앱이 먼저 거르고(DB 까지 보내지 않음), DB 의 거부를 어떤 응답으로 바꾸는지 본다.

type Who = { operator: boolean; owner: boolean };
const OWNER: Who = { operator: true, owner: true };
const ADDRESS = "서울특별시 강남구 선릉로91길 8, 4층 팬꾹 검수센터";

function fakeClient(saveError: { code: string } | null, who: Who = OWNER) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: null, error: saveError };
    },
  } as never;
  return { calls, client };
}

describe("팬꾹 주소 저장 응답 (INV-K19)", () => {
  it("INV-K19 (S19): 대표가 보낸 값의 앞뒤 공백을 빼서 DB 저장 함수에 넘기고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await saveOfficeAddress(client, { address: `  ${ADDRESS} ` })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_set_office_address", args: { p_address: ADDRESS } }]);
  });

  it("INV-K19 (S19b, 실패경로): 직원 운영자는 403, 운영자가 아니면 404 — DB 저장 함수를 부르지 않는다", async () => {
    const staff = fakeClient(null, { operator: true, owner: false });
    expect(await saveOfficeAddress(staff.client, { address: ADDRESS })).toEqual({ status: 403, body: { message: OFFICE_ADDRESS_MESSAGE.ownerOnly } });
    const fan = fakeClient(null, { operator: false, owner: false });
    expect((await saveOfficeAddress(fan.client, { address: ADDRESS })).status).toBe(404);
    expect([...staff.calls, ...fan.calls]).toEqual([]);
  });

  it.each([
    ["공백뿐", { address: "     " }],
    ["4자", { address: "서울 강" }],
    ["121자", { address: "가".repeat(121) }],
    ["줄바꿈", { address: "서울특별시 강남구\n4층" }],
    ["글자가 아님", { address: 12345 }],
    ["칸 빠짐", {}],
    ["모르는 칸", { address: ADDRESS, extra: 1 }],
  ])("INV-K19 (S19c, 실패경로): %s 이면 DB 까지 보내지 않고 400", async (_label, body) => {
    const { calls, client } = fakeClient(null);
    expect(await saveOfficeAddress(client, body)).toEqual({ status: 400, body: { message: OFFICE_ADDRESS_MESSAGE.shape } });
    expect(calls).toEqual([]);
  });

  it("INV-K19 (실패경로): DB 가 대표 아님(42501)·값(22023)으로 거부하면 403·400, 그 밖은 500", async () => {
    expect((await saveOfficeAddress(fakeClient({ code: "42501" }).client, { address: ADDRESS })).status).toBe(403);
    expect((await saveOfficeAddress(fakeClient({ code: "22023" }).client, { address: ADDRESS })).status).toBe(400);
    expect(await saveOfficeAddress(fakeClient({ code: "XX000" }).client, { address: ADDRESS })).toEqual({ status: 500, body: { message: OFFICE_ADDRESS_MESSAGE.failed } });
  });
});
