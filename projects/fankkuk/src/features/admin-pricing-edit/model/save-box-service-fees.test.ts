import { describe, expect, it } from "vitest";
import { BOX_FEE_MESSAGE, saveBoxServiceFees } from "./save-box-service-fees";

// 선물함 서비스료 저장 응답 (revgift-box INV-GB13~GB15, admin-console INV-K2). DB 판정 자체는 통합 시험이 본다 —
// 여기서는 대표만·숫자 범위를 앱이 먼저 거르고(DB 까지 보내지 않음), DB 의 거부를 어떤 응답으로 바꾸는지 본다.

type Who = { operator: boolean; owner: boolean };
const OWNER: Who = { operator: true, owner: true };

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

describe("선물함 서비스료 저장 응답", () => {
  it("INV-GB14·GB15: 대표가 보낸 정가·초기 크리에이터 값을 그대로 DB 저장 함수에 넘기고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await saveBoxServiceFees(client, { regular_krw: 800, early_krw: 400 })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_save_box_service_fees", args: { p_regular_krw: 800, p_early_krw: 400 } }]);
  });

  it("INV-K2 (실패경로): 직원 운영자는 403, 운영자가 아니면 404 — DB 저장 함수를 부르지 않는다", async () => {
    const staff = fakeClient(null, { operator: true, owner: false });
    expect(await saveBoxServiceFees(staff.client, { regular_krw: 800, early_krw: 400 })).toEqual({ status: 403, body: { message: BOX_FEE_MESSAGE.ownerOnly } });
    const fan = fakeClient(null, { operator: false, owner: false });
    expect((await saveBoxServiceFees(fan.client, { regular_krw: 800, early_krw: 400 })).status).toBe(404);
    expect([...staff.calls, ...fan.calls]).toEqual([]);
  });

  it.each([
    ["정가 100,000원 초과", { regular_krw: 100_001, early_krw: 300 }],
    ["음수", { regular_krw: 700, early_krw: -1 }],
    ["소수", { regular_krw: 700.5, early_krw: 300 }],
    ["글자", { regular_krw: "700", early_krw: 300 }],
    ["초기 크리에이터가 정가보다 큼", { regular_krw: 700, early_krw: 800 }],
    ["칸 빠짐", { regular_krw: 700 }],
    ["모르는 칸", { regular_krw: 700, early_krw: 300, extra: 1 }],
  ])("실패경로: %s 이면 DB 까지 보내지 않고 400", async (_label, body) => {
    const { calls, client } = fakeClient(null);
    expect(await saveBoxServiceFees(client, body)).toEqual({ status: 400, body: { message: BOX_FEE_MESSAGE.shape } });
    expect(calls).toEqual([]);
  });

  it("실패경로: DB 가 대표 아님(42501)·범위(22023)로 거부하면 403·400, 그 밖은 500", async () => {
    expect((await saveBoxServiceFees(fakeClient({ code: "42501" }).client, { regular_krw: 700, early_krw: 300 })).status).toBe(403);
    expect((await saveBoxServiceFees(fakeClient({ code: "22023" }).client, { regular_krw: 700, early_krw: 300 })).status).toBe(400);
    expect(await saveBoxServiceFees(fakeClient({ code: "XX000" }).client, { regular_krw: 700, early_krw: 300 })).toEqual({ status: 500, body: { message: BOX_FEE_MESSAGE.failed } });
  });
});
