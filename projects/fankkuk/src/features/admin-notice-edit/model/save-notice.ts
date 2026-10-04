import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";

// 공지 쓰기·고치기 (admin-console INV-K11). 운영자(대표·직원)면 누구나 한다.
// 본문은 글자로만 보낸다 — DB 가 빈 줄로 나눠 문단 덩어리로 바꾸므로 화면이 링크 덩어리를 끼워 넣을 길이 없다.
// slug 가 null 이면 새 공지, 있으면 그 공지를 고친다.

export const NOTICE_TITLE_MAX = 100;
export const NOTICE_BODY_MAX = 5000;

const MESSAGES = {
  limit: `제목은 1~${NOTICE_TITLE_MAX}자, 본문은 ${NOTICE_BODY_MAX}자까지 적을 수 있어요. 본문은 비울 수 없어요.`,
  failed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

const bodyShape = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9-]{1,40}$/)
      .nullable(),
    title: z
      .string()
      .transform((s) => s.trim())
      .refine((s) => charCount(s) >= 1 && charCount(s) <= NOTICE_TITLE_MAX),
    // DB 는 앞뒤를 다듬기 전 글자 수로 5000자를 본다 — 같은 기준으로 먼저 세고 나서 다듬는다
    body: z
      .string()
      .refine((s) => charCount(s) <= NOTICE_BODY_MAX && s.trim() !== "")
      .transform((s) => s.trim()),
    pinned: z.boolean(),
  })
  .strict();

export type NoticeWrite = z.input<typeof bodyShape>;

/** client = 로그인한 사람의 세션 클라이언트. 운영자 판정은 DB 가 그 토큰의 사람으로 한다. */
export async function saveNotice(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGES.limit } };
  const { slug, title, body: text, pinned } = shaped.data;
  const { data, error } = await client.rpc("admin_save_notice", { p_slug: slug, p_title: title, p_body: text, p_pinned: pinned });
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true, slug: typeof data === "string" ? data : null } };
}
