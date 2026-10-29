import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { PROHIBITED_DESCRIPTION_MAX, PROHIBITED_NAME_MAX } from "@/entities/parcel/model/prohibited-item";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 보낼 수 없는 물품 추가·고치기·지우기 (admin-console INV-K9). 운영자(대표·직원)면 누구나 한다.
// 서버는 먼저 운영자인지 DB 에 묻고(아니면 404), 몸통 꼴과 글자 수를 확인해 어긋난 입력은 DB 까지 보내지 않는다.
// 최종 판정(운영자인지·글자 수)과 바꾼 기록은 DB 함수가 한다.

const MESSAGE_LIMIT = `이름은 1~${PROHIBITED_NAME_MAX}자, 설명은 ${PROHIBITED_DESCRIPTION_MAX}자까지 적을 수 있어요.`;
const MESSAGES = { limit: MESSAGE_LIMIT, failed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };

const name = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => charCount(s) >= 1 && charCount(s) <= PROHIBITED_NAME_MAX);
const description = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => charCount(s) <= PROHIBITED_DESCRIPTION_MAX);
const id = z.guid();

const bodyShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), name, description }).strict(),
  z.object({ kind: z.literal("edit"), id, name, description }).strict(),
  z.object({ kind: z.literal("delete"), id }).strict(),
]);

export type ProhibitedWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 운영자인지 본다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function saveProhibited(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  // INV-K1 S1c: 운영자가 아니면 관리자 주소가 있는 줄도 모르게 404. INV-K9 S9b: 크리에이터·팬은 여기서 막힌다.
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_LIMIT } };
  const input = shaped.data;

  if (input.kind === "add") {
    const { data, error } = await client.rpc("admin_add_prohibited_item", { p_name: input.name, p_description: input.description });
    if (error) return pgErrorReply(error.code, MESSAGES);
    return { status: 200, body: { ok: true, id: typeof data === "string" ? data : null } };
  }
  const { error } =
    input.kind === "edit"
      ? await client.rpc("admin_edit_prohibited_item", { p_id: input.id, p_name: input.name, p_description: input.description })
      : await client.rpc("admin_delete_prohibited_item", { p_id: input.id });
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true } };
}
