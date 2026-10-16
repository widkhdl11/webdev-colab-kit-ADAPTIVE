import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isNicknameValue } from "@/entities/parcel/model/office-lists";
import { PARCEL_TIERS, type OfficeTier } from "@/entities/parcel/model/office-parcel";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 운영자 확인 목록의 「주인 주문으로 입고」 (inbound-address-code INV-C12, office-workflow INV-W5, 카드 d94).
// 6자리 없이 온 닉네임 없음 보류 상자의 주인이라는 문의가 오면, 운영자가 송장번호·내용물을 확인하고 문의한 팬의 닉네임으로 계정을 골라
// 그 계정의 결제 완료·입고 전 상자 하나로 입고한다. 이 쓰기는 「송장번호·내용물 확인함」 표시가 있어야만 보낸다(DB 도 다시 본다).
// 주문번호는 받지 않는다 — 상자는 후보 읽기(그 닉네임 계정의 입고 전 상자)에서 고른다(INV-C9 「주문번호로 잇는 함수는 없다」).
// 운영자가 아니면 404. 후보인지·닉네임이 맞은 다른 계정의 상자인지·같은 송장번호 분쟁인지·기한이 지났는지는 DB 가 상자 줄부터 잠근 뒤 판정한다(INV-W12).

export const MESSAGE_NOT_CANDIDATE = "그 팬의 결제가 끝났고 아직 도착 전인 상자가 아니에요. 상자를 다시 골라 주세요.";
export const MESSAGE_LINK_CLOSED = "이미 입고됐거나 반송 대기가 됐거나, 7일이 지난 상자예요.";
export const MESSAGE_WAYBILL_DISPUTE = "같은 송장번호가 다른 상자에 등록돼 있어요. 분쟁 상자라 여기서 처리하지 않아요.";
export const MESSAGE_NO_NICKNAME = "그 닉네임의 계정이 없어요.";
const MESSAGE_LINK_INPUT = "닉네임과 상자를 고르고, 송장번호·내용물 확인을 표시해 주세요.";
const MESSAGE_NICKNAME = "닉네임을 1~20자로 적어 주세요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
const READ_FAILED = "상자를 읽지 못했어요. 잠시 뒤 다시 해 주세요.";

// 닉네임 — 앞뒤 공백을 뺀 값이 DB 닉네임 칸과 같은 1~20자. DB 는 대소문자·앞뒤 공백을 무시하고 비교한다
const nickname = z
  .string()
  .max(40)
  .transform((s) => s.trim())
  .refine(isNicknameValue);

const linkShape = z.object({ kind: z.literal("link"), id: z.guid(), nickname, boxId: z.guid(), checked: z.literal(true) }).strict();
const candidatesShape = z.object({ kind: z.literal("candidates"), id: z.guid(), nickname }).strict();

export type HeldLinkWrite = z.input<typeof linkShape>;
export type HeldLinkCandidatesRead = z.input<typeof candidatesShape>;

/** 잇기 후보 — 그 닉네임 계정의 결제 완료·입고 전 팬 선물 상자 하나 */
export type LinkCandidate = { boxId: string; label: string; tier: OfficeTier; paidAt: string | null };

const candidateRows = z.array(
  z.object({ box_id: z.string(), label: z.string(), tier: z.enum(PARCEL_TIERS), paid_at: z.string().nullable() }),
);

type Rpc = Pick<SupabaseClient, "rpc">;

export async function linkHeld(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = linkShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_LINK_INPUT } };
  const { data, error } = await client.rpc("admin_link_held_parcel", {
    p_id: shaped.data.id,
    p_nickname: shaped.data.nickname,
    p_box_id: shaped.data.boxId,
    p_checked: shaped.data.checked,
  });
  if (error?.code === "P0047") return { status: 409, body: { message: MESSAGE_NOT_CANDIDATE } };
  if (error?.code === "P0048") return { status: 409, body: { message: MESSAGE_WAYBILL_DISPUTE } };
  if (error?.code === "P0002") return { status: 404, body: { message: MESSAGE_NO_NICKNAME } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_LINK_INPUT, conflict: MESSAGE_LINK_CLOSED, failed: FAILED });
  // 모르는 답이면 입고됐다고 단정하지 않는다
  if (data !== "linked") return { status: 500, body: { message: FAILED } };
  return { status: 200, body: { ok: true } };
}

export async function readLinkCandidates(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = candidatesShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_NICKNAME } };
  const { data, error } = await client.rpc("admin_held_link_candidates", { p_id: shaped.data.id, p_nickname: shaped.data.nickname });
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_NICKNAME, failed: READ_FAILED });
  const rows = candidateRows.safeParse(data);
  if (!rows.success) return { status: 500, body: { message: READ_FAILED } };
  const candidates: LinkCandidate[] = rows.data.map((r) => ({ boxId: r.box_id, label: r.label, tier: r.tier, paidAt: r.paid_at }));
  return { status: 200, body: { candidates } };
}
