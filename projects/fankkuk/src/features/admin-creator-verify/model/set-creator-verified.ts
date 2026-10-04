import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 크리에이터 본인 확인 승인·취소 (admin-console INV-K10). 운영자(대표·직원)면 누구나 한다.
// 누가 언제 했는지는 DB 함수가 기록한다. 같은 크리에이터를 두 사람이 동시에 눌러도 DB 가 한 사람만 바꾸고
// 나머지는 「이미 그 상태」(55000)로 거부한다 → 409.

export const REVOKE_REASON_MAX = 200;

const MESSAGES = {
  limit: `사유는 ${REVOKE_REASON_MAX}자까지 적을 수 있어요.`,
  conflict: "이미 처리됐어요. 새로 고침해 주세요.",
  failed: "처리하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

const bodyShape = z
  .object({
    creatorId: z.guid(),
    verified: z.boolean(),
    reason: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => charCount(s) <= REVOKE_REASON_MAX),
  })
  .strict();

export type CreatorVerifyWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 운영자 판정은 DB 가 그 토큰의 사람으로 한다. */
export async function setCreatorVerified(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGES.limit } };
  const { creatorId, verified, reason } = shaped.data;
  const { error } = await client.rpc("admin_set_creator_verified", { p_creator_id: creatorId, p_verified: verified, p_reason: reason });
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true } };
}
