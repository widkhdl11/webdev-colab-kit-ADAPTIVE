import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 1:1 문의 제한·풀기 (admin-console INV-K12). 대표만 한다 — 운영자가 아니면 404, 직원 운영자는 403.
// 대상은 문의 ID 로 고른다(그 문의를 쓴 계정). 화면이 계정 ID 를 보내지 않는다.
// 대표 판정·운영자 대상 거부·기록은 DB 함수가 최종으로 한다. 여기서는 어긋난 입력을 DB 까지 보내지 않는다.

export const RESTRICTION_REASON_MAX = 200;

const MESSAGE_REASON = `사유를 1~${RESTRICTION_REASON_MAX}자로 적어 주세요.`;
const MESSAGE_OPERATOR = "운영자 계정은 제한할 수 없어요.";
const MESSAGES = {
  limit: MESSAGE_REASON,
  conflict: "이미 바뀌었어요. 새로 고침해 주세요.",
  failed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
};
const MESSAGE_OWNER_ONLY = "문의 제한은 대표만 할 수 있어요.";

const bodyShape = z
  .object({
    id: z.guid(),
    restricted: z.boolean(),
    reason: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => charCount(s) >= 1 && charCount(s) <= RESTRICTION_REASON_MAX),
  })
  .strict();

export type InquiryRestrictionWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 대표 판정은 DB 가 그 토큰의 사람으로 한다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function restrictInquiryAuthor(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const access = await readAdminAccess(client);
  if (access === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  if (access !== "owner") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGE_REASON } };
  const { id, restricted, reason } = shaped.data;
  const { error } = await client.rpc("admin_set_inquiry_restriction", { p_inquiry_id: id, p_restricted: restricted, p_reason: reason });
  // 앱이 대표로 본 뒤 DB 가 거부하면(그 사이 대표가 바뀜) 앞의 403 과 같은 문구로
  if (error?.code === "42501") return { status: 403, body: { message: MESSAGE_OWNER_ONLY } };
  if (error?.code === "P0052") return { status: 400, body: { message: MESSAGE_OPERATOR } };
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true } };
}
