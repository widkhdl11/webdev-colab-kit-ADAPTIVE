import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BOX_SERVICE_FEE_MAX_KRW } from "@/entities/payment/model/box-service-fees";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";

// 선물함 서비스료(정가·초기 크리에이터) 저장 (revgift-box INV-GB13~GB15, admin-console INV-K2).
// 대표인지·범위는 DB 저장 함수가 최종으로 판정하고 바뀐 칸마다 기록도 남긴다. 앱은 같은 조건을 먼저 걸러 DB 까지 보내지 않는다.

export type BoxServiceFeesReply = { status: number; body: Record<string, unknown> };

export const BOX_FEE_MESSAGE = {
  notFound: "요청한 항목을 찾을 수 없습니다.",
  ownerOnly: "요금은 대표만 바꿀 수 있어요.",
  shape: "서비스료는 0원 이상 100,000원 이하로, 초기 크리에이터 값은 기본 값보다 크지 않게 넣어 주세요.",
  failed: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

const won = z.number().int().min(0).max(BOX_SERVICE_FEE_MAX_KRW);
const bodyShape = z
  .object({ regular_krw: won, early_krw: won })
  .strict()
  .refine((b) => b.early_krw <= b.regular_krw);

export type BoxServiceFeesBody = z.infer<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 대표인지 본다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function saveBoxServiceFees(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<BoxServiceFeesReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: BOX_FEE_MESSAGE.notFound } };
  if (access !== "owner") return { status: 403, body: { message: BOX_FEE_MESSAGE.ownerOnly } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: BOX_FEE_MESSAGE.shape } };

  const { error } = await client.rpc("admin_save_box_service_fees", { p_regular_krw: shaped.data.regular_krw, p_early_krw: shaped.data.early_krw });
  if (!error) return { status: 200, body: { ok: true } };
  if (error.code === "42501") return { status: 403, body: { message: BOX_FEE_MESSAGE.ownerOnly } };
  if (error.code === "22023") return { status: 400, body: { message: BOX_FEE_MESSAGE.shape } };
  return { status: 500, body: { message: BOX_FEE_MESSAGE.failed } };
}
