import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CARRIER_ROUTES, SHIP_TIERS, pricingProblemsFromRows, type PricingProblem } from "@/entities/payment/model/carrier-pricing";
import { PRICED_TIERS } from "@/entities/payment/model/price-table";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";

// 경로표·기본 경로·팬에게 보내기 택배비 저장 (admin-console INV-K2·K5·K15·K16).
// 대표인지·검사를 지키는지는 DB 저장 함수가 최종으로 판정하고, 요금표 택배 원가 칸 갱신과 기록도 같은 처리에서 한다.
// 검사(INV-K16)에 걸려 거부되면 같은 입력으로 DB 읽기 전용 검사를 불러 어긴 줄과 수정안을 함께 돌려준다.

export type CarrierPricingReply = { status: number; body: Record<string, unknown> };

const MESSAGE_NOT_FOUND = "요청한 항목을 찾을 수 없습니다.";
const MESSAGE_OWNER_ONLY = "요금은 대표만 바꿀 수 있어요.";
const MESSAGE_SHAPE = "입력한 값을 확인해 주세요. 금액은 0 이상 정수여야 해요.";
const MESSAGE_FAILED = "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.";

/** 검사 실패 문구 — DB 오류 코드별(P0041 = (a), P0042 = (b), P0043 = 빈 경로) */
export const CHECK_FAILED_MESSAGE: Readonly<Record<"P0041" | "P0042" | "P0043", string>> = {
  P0041: "팬 선물 받는 값이 기본 경로의 택배 원가 + 검수비보다 작아 저장하지 않았어요. 수정안을 확인해 주세요.",
  P0042: "팬에게 보내기 택배비가 기본 경로의 택배 원가(100원 단위 반올림)보다 작아 저장하지 않았어요. 수정안을 확인해 주세요.",
  P0043: "값이 다 채워지지 않은 경로는 기본 경로로 고를 수 없어요.",
};

const won = z.number().int().min(0).max(10_000_000);
const tierCosts = z.partialRecord(z.enum(SHIP_TIERS), won.nullable());
const bodyShape = z
  .object({
    default_route: z.enum(CARRIER_ROUTES).optional(),
    routes: z.partialRecord(z.enum(CARRIER_ROUTES), tierCosts).optional(),
    send_fees: z.partialRecord(z.enum(SHIP_TIERS), won).optional(),
    prices: z
      .array(z.object({ tier: z.enum(PRICED_TIERS), price_krw: won.min(1), inspection_fee_krw: won }).strict())
      .length(3)
      .refine((rows) => new Set(rows.map((r) => r.tier)).size === 3)
      .optional(),
  })
  .strict()
  .refine((b) => b.default_route !== undefined || b.routes !== undefined || b.send_fees !== undefined || b.prices !== undefined);

export type CarrierPricingBody = z.infer<typeof bodyShape>;

/** 몸통 → DB 함수 인자. 빠진 묶음은 null(= 지금 값 그대로). */
export function carrierPricingArgsOf(body: CarrierPricingBody) {
  return {
    p_default_route: body.default_route ?? null,
    p_routes: body.routes ?? null,
    p_send_fees: body.send_fees ?? null,
    p_prices: body.prices ?? null,
  };
}

function isCheckCode(code: string | undefined): code is keyof typeof CHECK_FAILED_MESSAGE {
  return code === "P0041" || code === "P0042" || code === "P0043";
}

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 대표인지 본다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function saveCarrierPricing(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<CarrierPricingReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_SHAPE } };

  const args = carrierPricingArgsOf(shaped.data);
  const { error } = await client.rpc("admin_save_carrier_pricing", args);
  if (!error) return { status: 200, body: { ok: true } };
  if (error.code === "42501") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  if (error.code === "22023") return { status: 400, body: { message: MESSAGE_SHAPE } };
  if (!isCheckCode(error.code)) return { status: 500, body: { message: MESSAGE_FAILED } };

  // INV-K16: 어긴 줄과 수정안 — 같은 입력을 지금 값에 얹어 읽기 전용 검사로 다시 본다(아무것도 바꾸지 않는다)
  const check = await client.rpc("admin_pricing_check", args);
  const problems: PricingProblem[] = (!check.error && pricingProblemsFromRows(check.data)) || [];
  return { status: 400, body: { message: CHECK_FAILED_MESSAGE[error.code], problems } };
}
