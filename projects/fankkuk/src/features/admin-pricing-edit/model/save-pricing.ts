import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PRICED_TIERS, checkPriceTable, type PriceTable } from "@/entities/payment/model/price-table";

// 요금표 저장 (admin-console INV-K2·K4·K5). 대표인지·조건을 지키는지는 DB 요금 변경 함수가 최종으로 판정하고 기록도 남긴다.
// 서버는 몸통 꼴을 보고, 같은 조건(INV-K4)을 먼저 확인해 어긋난 입력은 DB 까지 보내지 않는다.

export type PricingReply = { status: number; body: Record<string, unknown> };

const MESSAGE_OWNER_ONLY = "요금은 대표만 바꿀 수 있어요.";
const MESSAGE_RULES = "요금표 조건에 맞지 않아요.";
const MESSAGE_FAILED = "저장하지 못했어요. 잠시 뒤 다시 해 주세요.";

const won = z.number().int().min(0).max(10_000_000);
const rowShape = z.object({ tier: z.enum(PRICED_TIERS), price_krw: won, carrier_cost_krw: won, inspection_fee_krw: won }).strict();
const bodyShape = z.object({ rows: z.array(rowShape).length(3) }).strict();

export type PricingRow = z.infer<typeof rowShape>;

/** DB 오류 코드 → 응답. 42501 = 대표가 아님(INV-K2), 22023 = 요금표 조건 위반(INV-K4). 나머지는 내부 오류. */
export function pricingErrorReply(code: string | undefined): PricingReply {
  if (code === "42501") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  if (code === "22023") return { status: 400, body: { message: MESSAGE_RULES } };
  return { status: 500, body: { message: MESSAGE_FAILED } };
}

/** 몸통 → 요금표. 세 구간이 한 번씩 있고 INV-K4 를 지킬 때만. */
export function pricingTableOfBody(body: unknown): PriceTable | null {
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return null;
  const rows = shaped.data.rows;
  if (new Set(rows.map((r) => r.tier)).size !== 3) return null;
  const byTier = Object.fromEntries(
    rows.map((r) => [r.tier, { priceKrw: r.price_krw, carrierCostKrw: r.carrier_cost_krw, inspectionFeeKrw: r.inspection_fee_krw }]),
  );
  const checked = checkPriceTable(byTier);
  return checked.ok ? checked.table : null;
}

export function pricingRowsOf(table: PriceTable): PricingRow[] {
  return PRICED_TIERS.map((tier) => ({
    tier,
    price_krw: table[tier].priceKrw,
    carrier_cost_krw: table[tier].carrierCostKrw,
    inspection_fee_krw: table[tier].inspectionFeeKrw,
  }));
}

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 대표인지 본다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function savePricing(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<PricingReply> {
  const table = pricingTableOfBody(body);
  if (!table) return { status: 400, body: { message: MESSAGE_RULES } };
  const { error } = await client.rpc("admin_set_tier_prices", { p_rows: pricingRowsOf(table) });
  if (error) return pricingErrorReply(error.code);
  return { status: 200, body: { ok: true } };
}
