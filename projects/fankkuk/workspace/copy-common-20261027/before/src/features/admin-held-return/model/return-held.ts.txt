import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 운영자 확인 목록의 「반송으로 넘기기」 (inbound-address-code INV-C6·C9). 보류 상자를 반송 대상으로 넘긴다 — 7일 자동 처리와 같은 끝
// (원 송장 주소로 착불 반송). source 로 어느 목록의 줄인지 고른다: unmatched = 아직 이어지지 않은 미확인 입고(7일을 기다리지 않고),
// parcel = 주문에 묶인 채 보류된 상자(S9b·S9c — 주문에서 떼어 낸다. 분쟁이면 보류 + 168시간이 지나야 하는지는 DB 가 본다).
// 몸통은 그 줄 id 하나뿐이다. 주문번호·상자를 받는 칸은 없다 — 운영자가 상자를 주문에 잇는 길은 만들지 않는다(INV-C4·C9, strict).
// 운영자가 아니면 404. 이어졌거나 이미 반송 대상인지는 DB 가 행 잠금 뒤 다시 본다(55000 → 409).

export const MESSAGE_ALREADY_CLOSED = "이미 입고됐거나 반송 대기가 됐거나, 아직 주인의 확인을 기다리는 상자예요.";
const FAILED = "처리하지 못했어요. 잠시 뒤 다시 해 주세요.";

const returnShape = z.object({ kind: z.literal("return"), source: z.enum(["unmatched", "parcel"]), id: z.guid() }).strict();

export type HeldReturnWrite = z.input<typeof returnShape>;

export async function returnHeld(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = returnShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: "잘못된 요청이에요." } };
  const fn = shaped.data.source === "parcel" ? "admin_return_held_parcel" : "admin_return_unmatched";
  const { error } = await client.rpc(fn, { p_id: shaped.data.id });
  if (error) return pgErrorReply(error.code, { limit: "잘못된 요청이에요.", conflict: MESSAGE_ALREADY_CLOSED, failed: FAILED });
  return { status: 200, body: { ok: true } };
}
