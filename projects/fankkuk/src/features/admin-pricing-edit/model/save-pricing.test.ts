import { describe, expect, it } from "vitest";
import { pricingErrorReply, savePricing } from "./save-pricing";

const ROWS = [
  { tier: "small", price_krw: 7400, carrier_cost_krw: 4000, inspection_fee_krw: 1500 },
  { tier: "medium", price_krw: 8900, carrier_cost_krw: 5000, inspection_fee_krw: 2000 },
  { tier: "large", price_krw: 10900, carrier_cost_krw: 6500, inspection_fee_krw: 2500 },
];

function fakeClient(error: { code: string } | null) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: null, error };
    },
  } as never;
  return { calls, client };
}

describe("요금표 저장 응답", () => {
  it("INV-K2 S2b (실패경로): DB 가 대표 아님(42501)으로 거부하면 403 「요금은 대표만 바꿀 수 있어요.」", () => {
    expect(pricingErrorReply("42501")).toEqual({ status: 403, body: { message: "요금은 대표만 바꿀 수 있어요." } });
  });

  it("INV-K4 (실패경로): DB 가 조건 위반(22023)으로 거부하면 400", () => {
    expect(pricingErrorReply("22023")).toEqual({ status: 400, body: { message: "요금표 조건에 맞지 않아요." } });
  });

  it("실패경로: 그 밖의 오류·코드 없음은 500 — DB 문구를 그대로 내보내지 않는다", () => {
    expect(pricingErrorReply("P0001").status).toBe(500);
    expect(pricingErrorReply(undefined).status).toBe(500);
  });

  it("INV-K2 S2: 세 구간을 그대로 DB 요금 변경 함수에 넘기고 200", async () => {
    const { calls, client } = fakeClient(null);
    expect(await savePricing(client, { rows: ROWS })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_set_tier_prices", args: { p_rows: ROWS } }]);
  });

  it("INV-K2 S2b (실패경로): 직원이 저장하면 DB 거부가 403 으로 나간다", async () => {
    const { client } = fakeClient({ code: "42501" });
    expect((await savePricing(client, { rows: ROWS })).status).toBe(403);
  });

  it("INV-K4 S4 (실패경로): 꼴이 틀리거나 조건을 어긴 몸통은 DB 를 부르지 않고 400", async () => {
    const bad: unknown[] = [
      null,
      { rows: ROWS.slice(0, 2) },
      { rows: [ROWS[0], ROWS[0], ROWS[2]] },
      { rows: ROWS.map((r) => ({ ...r, price_krw: String(r.price_krw) })) },
      { rows: ROWS.map((r, i) => (i === 0 ? { ...r, carrier_cost_krw: -1 } : r)) },
      { rows: ROWS.map((r, i) => (i === 1 ? { ...r, carrier_cost_krw: 7000 } : r)) }, // 원가 + 검수비 > 받는 값
      { rows: ROWS.map((r, i) => (i === 1 ? { ...r, price_krw: 7000 } : r)) }, // 중형 < 소형
      { rows: ROWS.map((r, i) => (i === 0 ? { ...r, service_fee_krw: 0 } : r)) }, // 모르는 칸
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient(null);
      expect((await savePricing(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });
});
