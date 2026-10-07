import { describe, expect, it } from "vitest";
import { computeCharge, computeRevgiftCharge } from "./charge";
import { checkPriceTable, isPricedTier, lowestPriceKrw, priceTableFromRows, publicPriceTableFromRows, type PriceTable } from "./price-table";

// 첫 요금표(admin-console INV-K6 · payment INV-M1·M7). 운영 값은 DB 요금표에서만 온다 — 여기 값은 시험용이다.
const FIRST: PriceTable = {
  small: { priceKrw: 6900, carrierCostKrw: 4000, inspectionFeeKrw: 1500 },
  medium: { priceKrw: 8900, carrierCostKrw: 5000, inspectionFeeKrw: 2000 },
  large: { priceKrw: 10900, carrierCostKrw: 6500, inspectionFeeKrw: 2500 },
};

function withTier(tier: keyof PriceTable, patch: Partial<PriceTable["small"]>): unknown {
  return { ...FIRST, [tier]: { ...FIRST[tier], ...patch } };
}

describe("요금표 저장 조건 (INV-K4)", () => {
  it("INV-K4: 첫 요금표는 저장된다", () => {
    expect(checkPriceTable(FIRST)).toEqual({ ok: true, table: FIRST });
  });

  it("INV-K4 (a, 실패경로): 음수·소수·숫자 아님·받는 값 0 은 통째로 거부", () => {
    expect(checkPriceTable(withTier("small", { carrierCostKrw: -1 }))).toEqual({ ok: false, problem: "not_integer" });
    expect(checkPriceTable(withTier("medium", { priceKrw: 8900.5 }))).toEqual({ ok: false, problem: "not_integer" });
    expect(checkPriceTable(withTier("large", { inspectionFeeKrw: "2500" as never }))).toEqual({ ok: false, problem: "not_integer" });
    expect(checkPriceTable(withTier("small", { priceKrw: 0, carrierCostKrw: 0, inspectionFeeKrw: 0 }))).toEqual({ ok: false, problem: "price_zero" });
  });

  it("INV-K4 (b, 실패경로): 택배 원가 + 검수비가 받는 값을 넘으면 거부 — 같으면 저장(기본 서비스료 0)", () => {
    expect(checkPriceTable(withTier("medium", { carrierCostKrw: 7000 }))).toEqual({ ok: false, problem: "costs_exceed_price" });
    expect(checkPriceTable(withTier("medium", { priceKrw: 7000 })).ok).toBe(true); // 5,000 + 2,000 = 7,000
  });

  it("INV-K4 (c, 실패경로): 받는 값·택배 원가·검수비 중 하나라도 소형 ≤ 중형 ≤ 대형이 아니면 거부", () => {
    expect(checkPriceTable(withTier("medium", { priceKrw: 6800, carrierCostKrw: 4000, inspectionFeeKrw: 1500 }))).toEqual({
      ok: false,
      problem: "not_ascending",
    });
    expect(checkPriceTable(withTier("large", { carrierCostKrw: 4900 }))).toEqual({ ok: false, problem: "not_ascending" });
    expect(checkPriceTable(withTier("small", { inspectionFeeKrw: 2100 }))).toEqual({ ok: false, problem: "not_ascending" });
    // 같은 값은 허용(≤)
    expect(checkPriceTable(withTier("medium", { inspectionFeeKrw: 1500 })).ok).toBe(true);
  });

  it("INV-K4 (실패경로): 구간이 빠지거나 모르는 칸이 섞이면 거부", () => {
    const { large: _large, ...noLarge } = FIRST;
    expect(checkPriceTable(noLarge).ok).toBe(false);
    expect(checkPriceTable({ ...FIRST, small: { ...FIRST.small, discountKrw: 100 } }).ok).toBe(false);
  });
});

describe("대형 구간 요금 (INV-K6)", () => {
  it("INV-K6 (S6c): 대형 상자 하나는 10,900원 — 배송비 6,500 · 검수비 2,500 · 기본 서비스료 1,900", () => {
    expect(computeCharge(FIRST, { boxes: ["large"] })).toEqual({
      goodsKrw: 0,
      serviceFeeKrw: 1900,
      inspectionFeeKrw: 2500,
      shippingFeeKrw: 6500,
      totalKrw: 10900,
    });
  });

  it("INV-K6 (S6c): 역조공 대형 상자는 받는 값 − 검수비 = 8,400원 (reverse-gift INV-R3)", () => {
    expect(computeRevgiftCharge(FIRST, { boxes: ["large"] }).totalKrw).toBe(8400);
  });

  it("INV-K6 (실패경로): 대형을 넘는 상자는 금액을 만들지 않는다", () => {
    expect(() => computeCharge(FIRST, { boxes: ["oversize"] })).toThrow();
  });

  it("INV-K3: 금액은 넘겨받은 요금표로만 계산한다 — 요금표가 바뀌면 새 금액, 이전 표로 계산한 금액은 그대로", () => {
    const raised: PriceTable = { ...FIRST, small: { ...FIRST.small, priceKrw: 7400 } };
    const before = computeCharge(FIRST, { boxes: ["small"] });
    expect(computeCharge(raised, { boxes: ["small"] }).totalKrw).toBe(7400);
    expect(before.totalKrw).toBe(6900);
  });
});

const ROWS = [
  { tier: "small", price_krw: 6900, carrier_cost_krw: 4000, inspection_fee_krw: 1500 },
  { tier: "medium", price_krw: 8900, carrier_cost_krw: 5000, inspection_fee_krw: 2000 },
  { tier: "large", price_krw: 10900, carrier_cost_krw: 6500, inspection_fee_krw: 2500 },
];

describe("DB 줄 → 요금표 (INV-K4·K6)", () => {
  it("INV-K4: 세 구간 줄은 요금표가 된다", () => {
    expect(priceTableFromRows(ROWS)).toEqual(FIRST);
  });

  it("INV-K4 (실패경로): 같은 구간 줄이 두 번 오면 null — 뒤 줄이 앞 줄을 덮지 않는다", () => {
    // 네 줄째가 소형을 7,400 으로 덮어도 조건은 지키는 값이라, 겹침 검사가 없으면 요금표가 된다
    expect(priceTableFromRows([...ROWS, { ...ROWS[0]!, price_krw: 7400 }])).toBeNull();
  });

  it("INV-K6 (실패경로): 요금표에 없는 구간 줄(대형 초과)이 섞이면 null", () => {
    expect(priceTableFromRows([...ROWS, { tier: "oversize", price_krw: 20000, carrier_cost_krw: 0, inspection_fee_krw: 0 }])).toBeNull();
    expect(isPricedTier("oversize")).toBe(false);
    expect(isPricedTier("large")).toBe(true);
  });
});

const PUBLIC_ROWS = [
  { tier: "small", price_krw: 6900, revgift_price_krw: 5400 },
  { tier: "medium", price_krw: 8900, revgift_price_krw: 6900 },
  { tier: "large", price_krw: 10900, revgift_price_krw: 8400 },
];

describe("공개 요금표 (INV-K3 화면용)", () => {
  it("INV-K3: 공개 읽기 함수 줄은 구간마다 받는 값·역조공 값만 담는다", () => {
    expect(publicPriceTableFromRows(PUBLIC_ROWS)).toEqual({
      small: { priceKrw: 6900, revgiftPriceKrw: 5400 },
      medium: { priceKrw: 8900, revgiftPriceKrw: 6900 },
      large: { priceKrw: 10900, revgiftPriceKrw: 8400 },
    });
  });

  it("INV-K3 (실패경로): 구간 빠짐·겹침·소수·문자·역조공 값 > 받는 값이면 null", () => {
    expect(publicPriceTableFromRows(PUBLIC_ROWS.slice(0, 2))).toBeNull();
    expect(publicPriceTableFromRows([...PUBLIC_ROWS, PUBLIC_ROWS[0]])).toBeNull();
    expect(publicPriceTableFromRows(PUBLIC_ROWS.map((r, i) => (i === 0 ? { ...r, price_krw: 6900.5 } : r)))).toBeNull();
    expect(publicPriceTableFromRows(PUBLIC_ROWS.map((r, i) => (i === 1 ? { ...r, revgift_price_krw: "6900" } : r)))).toBeNull();
    expect(publicPriceTableFromRows(PUBLIC_ROWS.map((r, i) => (i === 2 ? { ...r, revgift_price_krw: 11000 } : r)))).toBeNull();
    expect(publicPriceTableFromRows(null)).toBeNull();
  });
});

describe("lowestPriceKrw", () => {
  it("공개 요금표에서 가장 싼 구간의 받는 값 — 구간 순서와 상관없이 최솟값", () => {
    const row = (priceKrw: number) => ({ priceKrw, revgiftPriceKrw: priceKrw - 500 });
    expect(lowestPriceKrw({ small: row(6900), medium: row(8900), large: row(12900) })).toBe(6900);
    expect(lowestPriceKrw({ small: row(9000), medium: row(7000), large: row(8000) })).toBe(7000);
    expect(lowestPriceKrw({ small: row(9000), medium: row(9500), large: row(4000) })).toBe(4000);
  });
});
