import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 1:1 문의 답하기 (admin-console INV-K11). 답은 운영자(대표·직원)만 단다. 한 문의에 답은 한 번 —
// 두 사람이 동시에 답해도 DB 가 한 사람만 받고 나머지는 「이미 답함」(55000)으로 거부한다 → 409.

export const ANSWER_MAX = 4000;

const MESSAGES = {
  limit: `답은 1~${ANSWER_MAX}자로 적어 주세요.`,
  conflict: "이미 답한 문의예요. 새로 고침해 주세요.",
  failed: "보내지 못했어요. 잠시 뒤 다시 해 주세요.",
};

const bodyShape = z
  .object({
    id: z.guid(),
    answer: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => charCount(s) >= 1 && charCount(s) <= ANSWER_MAX),
  })
  .strict();

export type InquiryAnswerWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 운영자 판정은 DB 가 그 토큰의 사람으로 한다. */
export async function answerInquiry(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGES.limit } };
  const { error } = await client.rpc("admin_answer_inquiry", { p_id: shaped.data.id, p_answer: shaped.data.answer });
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true } };
}
