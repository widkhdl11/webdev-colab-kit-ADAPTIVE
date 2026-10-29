import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 운영자 몫 옮기기 (inbound-address-code INV-C11, 2026-10-16 카드 d93 ⑧). 크리에이터가 미확인 상자 찾기(INV-C4 ②-나)에서 팬을 잘못 골랐다는
// 1:1 문의가 오면, 운영자가 그 상자를 같은 크리에이터가 보낸 다른 몫으로 옮긴다. 검수 완료 전, 찾기로 이은 상자만 — 6자리로 입고된 상자는 옮기지 않는다.
// 옮길 곳은 후보 읽기(그 크리에이터의 결제 끝·입고 전 몫)에서 고르고, DB 가 몫 줄을 잠근 뒤 후보인지 다시 판정한다(다른 크리에이터의 몫은 「후보 아님」).
// 누가 언제 어느 몫에서 어느 몫으로 옮겼는지는 DB 가 운영자 기록에 남긴다(지우지 않음). 운영자가 아니면 404.

export const MESSAGE_MOVE_NOT_CANDIDATE = "그 크리에이터가 보낸, 아직 입고 전인 다른 팬별 선물이 아니에요. 다시 골라 주세요.";
export const MESSAGE_MOVE_CLOSED = "상자 찾기로 입고된 상자가 아니거나 이미 검수를 마친 상자라 옮길 수 없어요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";
const READ_FAILED = "팬별 선물을 읽지 못했어요. 잠시 뒤 다시 해 주세요.";

const moveShape = z.object({ kind: z.literal("move"), id: z.guid(), shareId: z.guid() }).strict();
const candidatesShape = z.object({ kind: z.literal("move_candidates"), id: z.guid() }).strict();

export type ShareMoveWrite = z.input<typeof moveShape>;
export type ShareMoveCandidatesRead = z.input<typeof candidatesShape>;

/** 옮길 곳 후보 — 몫 하나(받는 팬 닉네임·상자 크기·몫 번호) */
export type MoveCandidate = { shareId: string; nickname: string; tier: string; orderNo: string };

const candidateRows = z.array(z.object({ share_id: z.string(), fan_nickname: z.string(), tier: z.string(), order_no: z.string() }).strict());

type Rpc = Pick<SupabaseClient, "rpc">;

export async function moveShare(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = moveShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: "옮길 팬별 선물을 골라 주세요." } };
  const { data, error } = await client.rpc("admin_move_held_share", { p_id: shaped.data.id, p_share_id: shaped.data.shareId });
  if (error?.code === "P0047") return { status: 409, body: { message: MESSAGE_MOVE_NOT_CANDIDATE } };
  if (error?.code === "40001") return { status: 409, body: { message: "잠시 뒤 다시 해 주세요." } };
  if (error) return pgErrorReply(error.code, { limit: "옮길 팬별 선물을 골라 주세요.", conflict: MESSAGE_MOVE_CLOSED, failed: FAILED });
  // 모르는 답이면 옮겼다고 단정하지 않는다
  if (data !== "moved") return { status: 500, body: { message: FAILED } };
  return { status: 200, body: { ok: true } };
}

export async function readMoveCandidates(client: Rpc, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = candidatesShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: READ_FAILED } };
  const { data, error } = await client.rpc("admin_share_move_candidates", { p_id: shaped.data.id });
  if (error) return pgErrorReply(error.code, { limit: READ_FAILED, failed: READ_FAILED });
  const rows = candidateRows.safeParse(data);
  if (!rows.success) return { status: 500, body: { message: READ_FAILED } };
  const candidates: MoveCandidate[] = rows.data.map((r) => ({ shareId: r.share_id, nickname: r.fan_nickname, tier: r.tier, orderNo: r.order_no }));
  return { status: 200, body: { candidates } };
}
