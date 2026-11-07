import { z } from "zod";

// 택배 원가 경로표 · 기본 경로 · 팬에게 보내기 택배비 · 요금 검사 결과 (admin-console INV-K15·K16).
// 값은 DB(carrier_route_costs·pricing_settings·fan_send_fees)에만 있고 대표가 /admin/pricing 에서 바꾼다. 코드에는 금액이 없다.

export const CARRIER_ROUTES = ["post_office", "logii_cj_a", "logii_visit", "agency"] as const;
export type CarrierRoute = (typeof CARRIER_ROUTES)[number];

export const CARRIER_ROUTE_NAME: Readonly<Record<CarrierRoute, string>> = {
  post_office: "우체국 창구 등기",
  logii_cj_a: "로지아이 CJ A등급",
  logii_visit: "로지아이 방문택배",
  agency: "대리점 계약",
};

/** 경로표·팬에게 보내기 택배비의 구간 넷. 팬 선물 요금표는 이 중 소·중·대 셋을 쓴다. */
export const SHIP_TIERS = ["xsmall", "small", "medium", "large"] as const;
export type ShipTier = (typeof SHIP_TIERS)[number];

export const SHIP_TIER_GUIDE: Readonly<Record<ShipTier, { name: string; rule: string }>> = {
  xsmall: { name: "극소형", rule: "80cm·2kg" },
  small: { name: "소형", rule: "100cm·5kg" },
  medium: { name: "중형", rule: "120cm·10kg" },
  large: { name: "대형", rule: "140cm·15kg" },
};

export type RouteCosts = Readonly<Record<ShipTier, number | null>>;

export type CarrierPricing = {
  defaultRoute: CarrierRoute;
  routes: Readonly<Record<CarrierRoute, RouteCosts>>;
  sendFees: Readonly<Record<ShipTier, number>>;
};

const won = z.number().int().nonnegative();
const readShape = z.object({
  default_route: z.enum(CARRIER_ROUTES),
  routes: z.array(z.object({ route: z.enum(CARRIER_ROUTES), tier: z.enum(SHIP_TIERS), cost_krw: won.nullable() })).length(16),
  send_fees: z.array(z.object({ tier: z.enum(SHIP_TIERS), fee_krw: won })).length(4),
});

/** DB 읽기 함수(admin_carrier_pricing)의 결과 → 경로표. 칸이 빠지거나 겹치면 null. */
export function carrierPricingFromRow(row: unknown): CarrierPricing | null {
  const parsed = readShape.safeParse(row);
  if (!parsed.success) return null;
  const routes = {} as Record<CarrierRoute, Record<ShipTier, number | null>>;
  for (const r of parsed.data.routes) {
    routes[r.route] ??= {} as Record<ShipTier, number | null>;
    if (r.tier in routes[r.route]) return null;
    routes[r.route][r.tier] = r.cost_krw;
  }
  const sendFees = {} as Record<ShipTier, number>;
  for (const f of parsed.data.send_fees) {
    if (f.tier in sendFees) return null;
    sendFees[f.tier] = f.fee_krw;
  }
  const complete = CARRIER_ROUTES.every((route) => routes[route] && SHIP_TIERS.every((t) => t in routes[route])) && SHIP_TIERS.every((t) => t in sendFees);
  return complete ? { defaultRoute: parsed.data.default_route, routes, sendFees } : null;
}

/** 경로의 칸이 모두 찼는가 — 다 차기 전에는 기본 경로로 고를 수 없다(INV-K15). */
export function isRouteComplete(costs: RouteCosts): boolean {
  return SHIP_TIERS.every((t) => costs[t] !== null);
}

/**
 * 요금 검사(INV-K16)의 실패 한 줄.
 *   fan_gift: 팬 선물 받는 값 < 기본 경로 원가 + 검수비 — 수정안은 원가 + 검수비 + 지금 기본 서비스료
 *   fan_send: 팬에게 보내기 택배비 < 기본 경로 원가(100원 반올림) — 수정안은 반올림 값
 *   route_incomplete: 기본 경로로 고른 경로의 칸이 비었다
 */
export type PricingProblem =
  | { kind: "fan_gift" | "fan_send"; tier: ShipTier; amountKrw: number; minimumKrw: number; proposalKrw: number }
  | { kind: "route_incomplete"; tier: ShipTier };

const problemShape = z.discriminatedUnion("check_kind", [
  z.object({ check_kind: z.enum(["fan_gift", "fan_send"]), tier: z.enum(SHIP_TIERS), amount_krw: won, minimum_krw: won, proposal_krw: won }),
  z.object({ check_kind: z.literal("route_incomplete"), tier: z.enum(SHIP_TIERS) }).passthrough(),
]);

/** DB 검사 함수(admin_pricing_check)의 줄 → 실패 목록. 모양이 다른 줄이 있으면 null. */
export function pricingProblemsFromRows(rows: unknown): PricingProblem[] | null {
  const parsed = z.array(problemShape).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) =>
    r.check_kind === "route_incomplete"
      ? { kind: "route_incomplete" as const, tier: r.tier }
      : { kind: r.check_kind, tier: r.tier, amountKrw: r.amount_krw, minimumKrw: r.minimum_krw, proposalKrw: r.proposal_krw },
  );
}
