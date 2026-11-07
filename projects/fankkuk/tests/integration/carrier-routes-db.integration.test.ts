import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetPrices } from "./admin-pricing-helpers";
import { anonClient, psql, signedInClient } from "./helpers";

// 택배 원가 경로표·기본 경로·요금 검사 (admin-console INV-K15·INV-K16, S15~S16c).
// 금액은 이 시험이 표에 넣은 값(아래 상수)으로 계산한다 — 기대값에 숫자를 따로 박지 않는다.
// 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자.

type ShipTier = "xsmall" | "small" | "medium" | "large";
type Costs = Record<ShipTier, number>;

const SHIP_TIERS: readonly ShipTier[] = ["xsmall", "small", "medium", "large"];
const GIFT_TIERS = ["small", "medium", "large"] as const;

const POST: Costs = { xsmall: 4000, small: 4500, medium: 6000, large: 13000 };
const CJ: Costs = { xsmall: 2990, small: 3490, medium: 4390, large: 5500 };
const VISIT: Costs = { xsmall: 4490, small: 4490, medium: 4490, large: 4490 };
const SEND_FEES: Costs = { xsmall: 3000, small: 3500, medium: 4400, large: 5500 };
const INSPECTION = 900;
// 팬 선물 받는 값(요금 11-07 최종). 택배 원가 칸은 기본 경로(CJ) 값.
const GIFT_PRICE: Record<"small" | "medium" | "large", number> = { small: 5900, medium: 7900, large: 9900 };

const round100 = (n: number) => Math.round(n / 100) * 100;

function setRoute(route: string, costs: Partial<Costs> | null): string[] {
  return SHIP_TIERS.map((t) => `update public.carrier_route_costs set cost_krw = ${costs?.[t] ?? "null"} where route = '${route}' and tier = '${t}';`);
}

/** 시험마다 같은 출발점 — 기본 경로 CJ, 팬 선물 요금표는 CJ 원가 + 검수비 900, 대리점 계약은 비어 있음. 기록은 지운다. */
function arrange(sendFees: Costs = SEND_FEES): void {
  psql(
    [
      "begin;",
      ...setRoute("post_office", POST),
      ...setRoute("logii_cj_a", CJ),
      ...setRoute("logii_visit", VISIT),
      ...setRoute("agency", null),
      "update public.pricing_settings set default_route = 'logii_cj_a';",
      ...SHIP_TIERS.map((t) => `update public.fan_send_fees set fee_krw = ${sendFees[t]} where tier = '${t}';`),
      ...GIFT_TIERS.map(
        (t) => `update public.tier_prices set price_krw = ${GIFT_PRICE[t]}, carrier_cost_krw = ${CJ[t]}, inspection_fee_krw = ${INSPECTION} where tier = '${t}';`,
      ),
      "set local session_replication_role = replica;",
      "delete from public.tier_price_changes;",
      "delete from public.pricing_setting_changes;",
      "commit;",
    ].join(" "),
  );
}

function carrierCostsNow(): string {
  return psql("select string_agg(tier || ':' || carrier_cost_krw, ',' order by tier) from public.tier_prices");
}
function pricesNow(): string {
  return psql("select string_agg(tier || ':' || price_krw || '/' || carrier_cost_krw || '/' || inspection_fee_krw, ',' order by tier) from public.tier_prices");
}
function defaultRouteNow(): string {
  return psql("select default_route from public.pricing_settings");
}
function changeCount(): number {
  return Number(psql("select count(*) from public.tier_price_changes"));
}
function giftText(costs: Costs, price: Record<(typeof GIFT_TIERS)[number], number> = GIFT_PRICE): string {
  return GIFT_TIERS.map((t) => `${t}:${price[t]}/${costs[t]}/${INSPECTION}`).join(",");
}

type Problem = { check_kind: string; tier: string; amount_krw: number | null; minimum_krw: number | null; proposal_krw: number | null };

beforeEach(() => arrange());

afterAll(() => {
  arrange();
  resetPrices();
});

describe("택배 원가 경로표·기본 경로 (INV-K15)", () => {
  it("INV-K15: 첫 값 — 경로 넷 × 구간 넷, 기본 경로 로지아이 CJ A등급, 대리점 계약은 비어 있다(대표·운영자 읽기)", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const { data, error } = await staff.rpc("admin_carrier_pricing");
    expect(error).toBeNull();
    const d = data as { default_route: string; routes: { route: string; tier: string; cost_krw: number | null }[]; send_fees: { tier: string; fee_krw: number }[] };
    expect(d.default_route).toBe("logii_cj_a");
    expect(d.routes).toHaveLength(16);
    expect(d.routes.filter((r) => r.route === "agency").every((r) => r.cost_krw === null)).toBe(true);
    expect(d.routes.filter((r) => r.route === "post_office").map((r) => r.cost_krw)).toEqual(SHIP_TIERS.map((t) => POST[t]));
    expect(d.send_fees.map((f) => f.fee_krw)).toEqual(SHIP_TIERS.map((t) => SEND_FEES[t]));
  });

  it("INV-K15 (실패경로): 팬·크리에이터·로그인 안 한 사람은 경로표를 읽지 못한다", async () => {
    for (const id of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(id);
      expect((await c.rpc("admin_carrier_pricing")).data ?? null).toBeNull();
    }
    expect((await anonClient().rpc("admin_carrier_pricing")).error).not.toBeNull();
  });

  it("INV-K15 (S15): 대표가 기본 경로를 우체국 창구로 바꾸면 요금표 택배 원가 칸이 우체국 값으로 바뀌고 기록이 세 줄 남는다", async () => {
    // 우체국 값이 검사를 통과하도록 받는 값·팬에게 보내기 택배비를 먼저 맞춰 둔다(이 시험은 전환과 칸 갱신만 본다)
    const raised = { small: POST.small + INSPECTION, medium: POST.medium + INSPECTION, large: POST.large + INSPECTION };
    arrange(POST);
    psql(GIFT_TIERS.map((t) => `update public.tier_prices set price_krw = ${raised[t]} where tier = '${t}';`).join(" "));
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("admin_save_carrier_pricing", { p_default_route: "post_office" });
    expect(error).toBeNull();
    expect(defaultRouteNow()).toBe("post_office");
    expect(carrierCostsNow()).toBe(GIFT_TIERS.map((t) => `${t}:${POST[t]}`).join(","));
    expect(changeCount()).toBe(3);
    expect(psql("select string_agg(tier || ':' || field || ':' || before_krw || '>' || after_krw, ',' order by tier) from public.tier_price_changes")).toBe(
      GIFT_TIERS.map((t) => `${t}:carrier_cost_krw:${CJ[t]}>${POST[t]}`).join(","),
    );
  });

  it("INV-K15 (S15, 실패경로): 직원 운영자·팬이 전환하면 거부, 기본 경로·요금표 그대로", async () => {
    arrange(POST);
    for (const id of ["fankkuk_staff", "byeolbit_fan"]) {
      const c = await signedInClient(id);
      expect((await c.rpc("admin_save_carrier_pricing", { p_default_route: "logii_visit" })).error?.code).toBe("42501");
    }
    expect(defaultRouteNow()).toBe("logii_cj_a");
    expect(pricesNow()).toBe(giftText(CJ));
    expect(changeCount()).toBe(0);
  });

  it("INV-K15: 기본 경로의 값을 고치면 같은 처리에서 요금표 칸도 바뀌고 기록이 남는다 — 기본이 아닌 경로를 고치면 요금표는 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const lower = CJ.medium - 100;
    expect((await owner.rpc("admin_save_carrier_pricing", { p_routes: { logii_cj_a: { medium: lower } } })).error).toBeNull();
    expect(carrierCostsNow()).toBe(`small:${CJ.small},medium:${lower},large:${CJ.large}`);
    expect(changeCount()).toBe(1);
    expect((await owner.rpc("admin_save_carrier_pricing", { p_routes: { logii_visit: { small: VISIT.small + 10 } } })).error).toBeNull();
    expect(carrierCostsNow()).toBe(`small:${CJ.small},medium:${lower},large:${CJ.large}`);
    expect(psql("select cost_krw from public.carrier_route_costs where route = 'logii_visit' and tier = 'small'")).toBe(String(VISIT.small + 10));
  });

  it("INV-K15 (S15b, 실패경로): 값이 빈 대리점 계약을 기본 경로로 고르면 거부", async () => {
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_save_carrier_pricing", { p_default_route: "agency" })).error?.code).toBe("P0043");
    expect(defaultRouteNow()).toBe("logii_cj_a");
    expect(pricesNow()).toBe(giftText(CJ));
  });

  it("INV-K15 (S15b, 실패경로): 한 칸이라도 빈 경로는 기본 경로가 될 수 없고, 기본 경로의 칸을 비울 수도 없다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const partial = { agency: { xsmall: CJ.xsmall, small: CJ.small, medium: CJ.medium } };
    expect((await owner.rpc("admin_save_carrier_pricing", { p_default_route: "agency", p_routes: partial })).error?.code).toBe("P0043");
    expect((await owner.rpc("admin_save_carrier_pricing", { p_routes: { logii_cj_a: { large: null } } })).error?.code).toBe("P0043");
    expect(defaultRouteNow()).toBe("logii_cj_a");
    expect(psql("select count(*) from public.carrier_route_costs where route = 'agency' and cost_krw is not null")).toBe("0");
  });

  it("INV-K15: 대리점 계약 값을 다 채우면 기본 경로로 고를 수 있다", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const { error } = await owner.rpc("admin_save_carrier_pricing", { p_default_route: "agency", p_routes: { agency: CJ } });
    expect(error).toBeNull();
    expect(defaultRouteNow()).toBe("agency");
  });

  it("INV-K15 (실패경로): 표를 직접 고치지 못한다 — 로그인한 대표도 함수로만", async () => {
    const owner = await signedInClient("fankkuk_admin");
    await owner.from("carrier_route_costs").update({ cost_krw: 1 }).eq("route", "logii_cj_a");
    await owner.from("pricing_settings").update({ default_route: "post_office" }).eq("id", true);
    await owner.from("fan_send_fees").update({ fee_krw: 1 }).eq("tier", "small");
    expect(psql("select min(cost_krw) from public.carrier_route_costs where route = 'logii_cj_a'")).toBe(String(CJ.xsmall));
    expect(defaultRouteNow()).toBe("logii_cj_a");
    expect(psql("select fee_krw from public.fan_send_fees where tier = 'small'")).toBe(String(SEND_FEES.small));
  });
});

describe("요금 검사 (INV-K16)", () => {
  it("INV-K16 (S16, 실패경로): 대형 받는 값이 우체국 원가 + 검수비보다 작으면 전환 거부, 수정안은 경로 원가 + 검수비 + 지금 기본 서비스료", async () => {
    arrange(POST); // 팬에게 보내기 택배비는 우체국 값 이상 — (a) 만 걸린다
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_save_carrier_pricing", { p_default_route: "post_office" })).error?.code).toBe("P0041");
    expect(defaultRouteNow()).toBe("logii_cj_a");
    expect(pricesNow()).toBe(giftText(CJ));
    expect(changeCount()).toBe(0);

    const check = await owner.rpc("admin_pricing_check", { p_default_route: "post_office" });
    expect(check.error).toBeNull();
    const serviceNow = GIFT_PRICE.large - CJ.large - INSPECTION;
    expect(check.data as Problem[]).toEqual([
      { check_kind: "fan_gift", tier: "large", amount_krw: GIFT_PRICE.large, minimum_krw: POST.large + INSPECTION, proposal_krw: POST.large + INSPECTION + serviceNow },
    ]);
  });

  it("INV-K16 (S16): 수정안 값으로 대형 받는 값을 함께 저장하면 전환된다", async () => {
    arrange(POST);
    const owner = await signedInClient("fankkuk_admin");
    const proposal = POST.large + INSPECTION + (GIFT_PRICE.large - CJ.large - INSPECTION);
    const rows = GIFT_TIERS.map((t) => ({ tier: t, price_krw: t === "large" ? proposal : GIFT_PRICE[t], inspection_fee_krw: INSPECTION }));
    const { error } = await owner.rpc("admin_save_carrier_pricing", { p_default_route: "post_office", p_prices: rows });
    expect(error).toBeNull();
    expect(defaultRouteNow()).toBe("post_office");
    expect(pricesNow()).toBe(giftText(POST, { ...GIFT_PRICE, large: proposal }));
  });

  it("INV-K16 (S16b, 실패경로): 팬에게 보내기 택배비가 우체국 원가(100원 반올림)보다 작으면 전환 거부, 수정안은 반올림한 경로 값", async () => {
    // 팬 선물 받는 값은 넉넉히 올려 (a) 는 통과시킨다
    psql(GIFT_TIERS.map((t) => `update public.tier_prices set price_krw = ${POST[t] + INSPECTION + 5000} where tier = '${t}';`).join(" "));
    const owner = await signedInClient("fankkuk_admin");
    expect((await owner.rpc("admin_save_carrier_pricing", { p_default_route: "post_office" })).error?.code).toBe("P0042");
    expect(defaultRouteNow()).toBe("logii_cj_a");

    const check = await owner.rpc("admin_pricing_check", { p_default_route: "post_office" });
    expect(check.error).toBeNull();
    expect((check.data as Problem[]).map((p) => [p.check_kind, p.tier, p.proposal_krw])).toEqual(
      SHIP_TIERS.filter((t) => SEND_FEES[t] < round100(POST[t])).map((t) => ["fan_send", t, round100(POST[t])]),
    );
    expect((check.data as Problem[]).length).toBe(4);

    // 수정안대로 택배비를 함께 저장하면 전환된다
    const fees = Object.fromEntries(SHIP_TIERS.map((t) => [t, round100(POST[t])]));
    expect((await owner.rpc("admin_save_carrier_pricing", { p_default_route: "post_office", p_send_fees: fees })).error).toBeNull();
    expect(defaultRouteNow()).toBe("post_office");
  });

  it("INV-K16 (b): 반올림은 100원 단위 — 2,950 원가면 택배비 3,000 은 통과, 2,900 은 거부", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const cost = 2950;
    expect((await owner.rpc("admin_save_carrier_pricing", { p_routes: { logii_cj_a: { xsmall: cost } }, p_send_fees: { xsmall: round100(cost) } })).error).toBeNull();
    expect((await owner.rpc("admin_save_carrier_pricing", { p_send_fees: { xsmall: round100(cost) - 100 } })).error?.code).toBe("P0042");
    expect(psql("select fee_krw from public.fan_send_fees where tier = 'xsmall'")).toBe(String(round100(cost)));
  });

  it("INV-K16 (S16c, 실패경로): 기본 경로 소형 원가를 받는 값 − 검수비보다 크게 고치면 거부, 요금표 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const tooHigh = GIFT_PRICE.small - INSPECTION + 100;
    // 팬에게 보내기 택배비는 넉넉히 — (a) 만 걸린다
    psql(`update public.fan_send_fees set fee_krw = ${round100(tooHigh) + 1000} where tier = 'small';`);
    expect((await owner.rpc("admin_save_carrier_pricing", { p_routes: { logii_cj_a: { small: tooHigh } } })).error?.code).toBe("P0041");
    expect(pricesNow()).toBe(giftText(CJ));
    expect(psql("select cost_krw from public.carrier_route_costs where route = 'logii_cj_a' and tier = 'small'")).toBe(String(CJ.small));
    expect(changeCount()).toBe(0);
  });

  it("INV-K16 (a): 요금표 저장도 같은 검사 — 받는 값을 기본 경로 원가 + 검수비보다 낮추면 거부", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const rows = GIFT_TIERS.map((t) => ({ tier: t, price_krw: GIFT_PRICE[t], carrier_cost_krw: 0, inspection_fee_krw: INSPECTION }));
    // 요금표의 원가 칸을 0 으로 보내 INV-K4 (b) 는 통과하지만, 기본 경로 원가로 보면 소형이 모자라다
    rows[0] = { ...rows[0], price_krw: CJ.small + INSPECTION - 1 };
    expect((await owner.rpc("admin_set_tier_prices", { p_rows: rows })).error?.code).toBe("P0041");
    expect(pricesNow()).toBe(giftText(CJ));
  });

  it("INV-K16 (c): 읽기 전용 검사 — 지금 값이면 실패 목록이 비고, 아무것도 바꾸지 않는다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const { data, error } = await staff.rpc("admin_pricing_check");
    expect(error).toBeNull();
    expect(data).toEqual([]);
    // DB 에 직접 붙은 배포 점검(대상 DB 의 psql)도 같은 결과
    expect(psql("select count(*) from public.admin_pricing_check()")).toBe("0");
    expect(defaultRouteNow()).toBe("logii_cj_a");
  });

  it("INV-K16 (c, 실패경로): 팬·크리에이터는 검사 함수를 부를 수 없다", async () => {
    for (const id of ["byeolbit_fan", "haru_creator"]) {
      const c = await signedInClient(id);
      expect((await c.rpc("admin_pricing_check")).error?.code).toBe("42501");
    }
    expect((await anonClient().rpc("admin_pricing_check")).error).not.toBeNull();
  });
});
