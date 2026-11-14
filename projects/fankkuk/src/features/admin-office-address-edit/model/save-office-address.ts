import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizeOfficeAddress, officeAddressProblem } from "@/entities/order/model/office-address";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";

// 팬꾹 주소 저장 (admin-console INV-K19 ①②). 대표인지·값 검사는 DB 저장 함수가 최종으로 판정하고 바뀌면 기록도 남긴다.
// 앱은 같은 조건을 먼저 걸러 DB 까지 보내지 않는다.

export type OfficeAddressReply = { status: number; body: Record<string, unknown> };

export const OFFICE_ADDRESS_MESSAGE = {
  notFound: "요청한 항목을 찾을 수 없습니다.",
  ownerOnly: "팬꾹 주소는 대표만 바꿀 수 있어요.",
  shape: "주소는 5~120자로, 줄을 바꾸지 말고 한 줄로 넣어 주세요.",
  failed: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
} as const;

const bodyShape = z.object({ address: z.string().max(1000) }).strict();

export type OfficeAddressBody = z.infer<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 대표인지 본다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function saveOfficeAddress(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<OfficeAddressReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: OFFICE_ADDRESS_MESSAGE.notFound } };
  if (access !== "owner") return { status: 403, body: { message: OFFICE_ADDRESS_MESSAGE.ownerOnly } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success || officeAddressProblem(shaped.data.address) !== null) return { status: 400, body: { message: OFFICE_ADDRESS_MESSAGE.shape } };

  const { error } = await client.rpc("admin_set_office_address", { p_address: normalizeOfficeAddress(shaped.data.address) });
  if (!error) return { status: 200, body: { ok: true } };
  if (error.code === "42501") return { status: 403, body: { message: OFFICE_ADDRESS_MESSAGE.ownerOnly } };
  if (error.code === "22023") return { status: 400, body: { message: OFFICE_ADDRESS_MESSAGE.shape } };
  return { status: 500, body: { message: OFFICE_ADDRESS_MESSAGE.failed } };
}
