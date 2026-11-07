import { describe, expect, it } from "vitest";
import { CHECK_FAILED_MESSAGE, saveCarrierPricing } from "./save-carrier-pricing";

// 경로표 저장 응답 (admin-console INV-K2·K15·K16). DB 판정·검사 자체는 통합 시험(carrier-routes-db)이 본다 —
// 여기서는 서버가 DB 의 거부를 어떤 응답으로 바꾸고, 수정안을 붙이는지만 본다.

type Who = { operator: boolean; owner: boolean };
const OWNER: Who = { operator: true, owner: true };

const PROBLEM_ROW = { check_kind: "fan_gift", tier: "large", amount_krw: 9900, minimum_krw: 13900, proposal_krw: 17400 };

function fakeClient(saveError: { code: string } | null, who: Who = OWNER, checkRows: unknown = [PROBLEM_ROW]) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      if (fn === "admin_pricing_check") return { data: checkRows, error: null };
      return { data: null, error: saveError };
    },
  } as never;
  return { calls, client };
}

describe("경로표 저장 응답", () => {
  it("INV-K15 (S15): 기본 경로 전환을 그대로 DB 저장 함수에 넘기고 200 — 빠진 묶음은 null", async () => {
    const { calls, client } = fakeClient(null);
    expect(await saveCarrierPricing(client, { default_route: "post_office" })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([
      { fn: "admin_save_carrier_pricing", args: { p_default_route: "post_office", p_routes: null, p_send_fees: null, p_prices: null } },
    ]);
  });

  it("INV-K16 (S16, 실패경로): DB 가 검사 (a) 로 거부하면 같은 입력으로 검사 함수를 불러 수정안을 붙여 400", async () => {
    const { calls, client } = fakeClient({ code: "P0041" });
    const reply = await saveCarrierPricing(client, { default_route: "post_office" });
    expect(reply).toEqual({
      status: 400,
      body: {
        message: CHECK_FAILED_MESSAGE.P0041,
        problems: [{ kind: "fan_gift", tier: "large", amountKrw: PROBLEM_ROW.amount_krw, minimumKrw: PROBLEM_ROW.minimum_krw, proposalKrw: PROBLEM_ROW.proposal_krw }],
      },
    });
    expect(calls[1]).toEqual({ fn: "admin_pricing_check", args: calls[0].args });
  });

  it("INV-K16 (S16b·S15b, 실패경로): (b)·빈 경로 거부는 각자의 문구", async () => {
    for (const code of ["P0042", "P0043"] as const) {
      const { client } = fakeClient({ code }, OWNER, []);
      expect(await saveCarrierPricing(client, { default_route: "agency" })).toEqual({ status: 400, body: { message: CHECK_FAILED_MESSAGE[code], problems: [] } });
    }
  });

  it("INV-K2 (실패경로): 직원 운영자는 403, 운영자가 아니면 404 — DB 저장 함수를 부르지 않는다", async () => {
    const staff = fakeClient(null, { operator: true, owner: false });
    expect((await saveCarrierPricing(staff.client, { default_route: "post_office" })).status).toBe(403);
    const fan = fakeClient(null, { operator: false, owner: false });
    expect((await saveCarrierPricing(fan.client, { default_route: "post_office" })).status).toBe(404);
    expect([...staff.calls, ...fan.calls]).toEqual([]);
  });

  it.each([
    ["모르는 경로", { default_route: "cvs" }],
    ["소수 원가", { routes: { logii_cj_a: { small: 3490.5 } } }],
    ["음수 택배비", { send_fees: { small: -1 } }],
    ["요금표 두 줄", { prices: [{ tier: "small", price_krw: 5900, inspection_fee_krw: 900 }, { tier: "medium", price_krw: 7900, inspection_fee_krw: 900 }] }],
    ["요금표에 택배 원가 칸(경로에서 온다)", { prices: ["small", "medium", "large"].map((tier) => ({ tier, price_krw: 9900, carrier_cost_krw: 1, inspection_fee_krw: 900 })) }],
    ["바꿀 것 없음", {}],
    ["모르는 칸", { default_route: "post_office", oversize: true }],
  ])("실패경로: %s 이면 DB 까지 보내지 않고 400", async (_label, body) => {
    const { calls, client } = fakeClient(null);
    expect((await saveCarrierPricing(client, body)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("실패경로: 그 밖의 DB 오류는 500 — DB 문구를 그대로 내보내지 않는다", async () => {
    const { client } = fakeClient({ code: "XX000" });
    expect((await saveCarrierPricing(client, { default_route: "post_office" })).status).toBe(500);
  });
});
