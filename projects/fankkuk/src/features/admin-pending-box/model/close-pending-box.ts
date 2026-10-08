import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 거절·반려 때 아직 안 온 상자를 대표가 「도착하지 않음」으로 닫는다 (payment INV-M18). 팬에게 안내가 간 뒤(notifications INV-N17)
// 대표가 1:1 문의 등으로 확인하고 누른다. 닫으면 그 상자 금액 전액이 상자 환불 대상이 되고 그 상자의 6자리는 무효가 된다.
// 운영자가 아니면 404, 직원 운영자는 403. 대표 판정·대상 판정(아직 안 왔는지, 이미 닫혔는지)은 DB 함수가 잠근 뒤 최종으로 한다.

const MESSAGE_OWNER_ONLY = "도착하지 않은 상자는 대표만 닫을 수 있어요.";
const MESSAGE_BAD_BODY = "닫을 상자를 다시 골라 주세요.";
export const MESSAGE_NOT_CLOSABLE = "닫을 수 있는 상자가 아니에요. 그 사이 상자가 도착했거나 이미 닫혔을 수 있어요.";

const bodyShape = z.object({ boxId: z.string().uuid() }).strict();

export type PendingBoxCloseWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 대표 판정은 DB 가 그 토큰의 사람으로 한다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function closePendingBox(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_BAD_BODY } };
  const { error } = await client.rpc("admin_close_pending_box", { p_box_id: shaped.data.boxId });
  // 앱이 대표로 본 뒤 DB 가 거부하면(그 사이 대표가 바뀜) 앞의 403 과 같은 문구로
  if (error?.code === "42501") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  // 이미 도착했거나 이미 닫힌 상자 — 그 사이 입고와 겹친 경우도 여기로 온다(S18e)
  if (error?.code === "P0002") return { status: 409, body: { message: MESSAGE_NOT_CLOSABLE } };
  if (error) return pgErrorReply(error.code, { limit: MESSAGE_BAD_BODY, failed: "닫지 못했어요. 잠시 뒤 다시 해 주세요." });
  return { status: 200, body: { ok: true } };
}
