import { describe, expect, it } from "vitest";
import { pricingErrorReply, savePricing } from "./save-pricing";

const ROWS = [
  { tier: "small", price_krw: 7400, carrier_cost_krw: 4000, inspection_fee_krw: 1500 },
  { tier: "medium", price_krw: 8900, carrier_cost_krw: 5000, inspection_fee_krw: 2000 },
  { tier: "large", price_krw: 10900, carrier_cost_krw: 6500, inspection_fee_krw: 2500 },
];

type Who = { operator: boolean; owner: boolean };
const OWNER: Who = { operator: true, owner: true };

/** 로그인한 사람의 세션 클라이언트 대역. 판정 함수(is_operator·is_owner)는 who 로 답하고, 저장 함수는 error 로 답한다. */
function fakeClient(error: { code: string } | null, who: Who = OWNER) {
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

  it("INV-K2 S2b (실패경로): 판정을 지나도 DB 가 대표 아님으로 거부하면 403 으로 나간다", async () => {
    const { client } = fakeClient({ code: "42501" });
    expect((await savePricing(client, { rows: ROWS })).status).toBe(403);
  });

  it("INV-K1 S1c (실패경로): 운영자가 아니면(손님 포함) 404 — 관리자 저장 주소가 있는 줄도 모르게, DB 저장 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient(null, { operator: false, owner: false });
    expect(await savePricing(client, { rows: ROWS })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-K2 S2b (실패경로): 운영자지만 대표가 아니면 403 — DB 저장 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient(null, { operator: true, owner: false });
    expect(await savePricing(client, { rows: ROWS })).toEqual({ status: 403, body: { message: "요금은 대표만 바꿀 수 있어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-K1 (실패경로): 판정 함수가 오류면 운영자가 아닌 것으로 보고 404", async () => {
    const calls: string[] = [];
    const client = {
      rpc: async (fn: string) => {
        calls.push(fn);
        return { data: null, error: { code: "42501" } };
      },
    } as never;
    expect((await savePricing(client, { rows: ROWS })).status).toBe(404);
    expect(calls).toEqual(["is_operator"]);
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
