import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { REJECT_REASONS, REVOKE_REASONS, VERIFICATION_MEMO_MAX } from "@/entities/creator/model/creator-verification";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 운영자의 본인 확인 처리 (creator-verification INV-V6·V9·V10·V15, admin-console INV-K10). 운영자(대표·직원)면 누구나 한다.
// - approve: 확인 대기(올림) 신청을 승인 — 신청 식별값만 받는다. 크리에이터를 직접 확인됨으로 바꾸는 길은 없다(INV-V6).
// - reject: 코드 받음·확인 대기 신청을 반려 — 사유는 목록 값 하나 + 운영자 메모(200자까지, 크리에이터에게 안 보임, INV-V9).
// - revoke: 확인된 크리에이터의 승인 취소 — 취소 사유 목록 값 + 메모(INV-V9·V10).
// - unlock: 그 신청의 계정·채널의 신청 횟수 풀기 — 메모(INV-V15).
// 누가 언제 했는지는 DB 함수가 로그인 토큰의 사람으로 기록한다. 같은 신청에 두 처리가 함께 와도 DB 가 하나만 반영하고
// 나머지는 「이미 처리됨」(55000)으로 거부한다 → 409.

const MESSAGES = {
  limit: `사유를 목록에서 고르고, 메모는 ${VERIFICATION_MEMO_MAX}자까지 적어 주세요.`,
  conflict: "이미 처리됐어요. 새로 고침해 주세요.",
  failed: "처리하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

const memo = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => charCount(s) <= VERIFICATION_MEMO_MAX);

const bodyShape = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), applicationId: z.guid() }).strict(),
  z.object({ action: z.literal("reject"), applicationId: z.guid(), reasonCode: z.enum(REJECT_REASONS), memo }).strict(),
  z.object({ action: z.literal("revoke"), creatorId: z.guid(), reasonCode: z.enum(REVOKE_REASONS), memo }).strict(),
  z.object({ action: z.literal("unlock"), applicationId: z.guid(), memo }).strict(),
]);

export type CreatorVerificationDecision = z.input<typeof bodyShape>;

function rpcOf(d: z.output<typeof bodyShape>): { fn: string; args: Record<string, unknown> } {
  switch (d.action) {
    case "approve":
      return { fn: "admin_approve_creator_verification", args: { p_application_id: d.applicationId } };
    case "reject":
      return { fn: "admin_reject_creator_verification", args: { p_application_id: d.applicationId, p_reason_code: d.reasonCode, p_memo: d.memo } };
    case "revoke":
      return { fn: "admin_revoke_creator", args: { p_creator_id: d.creatorId, p_reason_code: d.reasonCode, p_memo: d.memo } };
    case "unlock":
      return { fn: "admin_unlock_creator_verification_count", args: { p_application_id: d.applicationId, p_memo: d.memo } };
  }
}

/** client = 로그인한 사람의 세션 클라이언트. 운영자 판정은 DB 가 그 토큰의 사람으로 한다. */
export async function decideCreatorVerification(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGES.limit } };
  const { fn, args } = rpcOf(shaped.data);
  const { error } = await client.rpc(fn, args);
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true } };
}
