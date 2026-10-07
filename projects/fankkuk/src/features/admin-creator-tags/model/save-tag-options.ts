import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TAG_CUSTOM_MAX } from "@/entities/creator/model/creator-tags";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { MESSAGE_NOT_FOUND, pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR } from "@/shared/lib/validation/hidden-char";

// 크리에이터 태그 선택지 관리 (creator-tags INV-T1) · 직접 입력을 선택지에 넣기 (INV-T5). 운영자(대표·직원)면 누구나 한다.
// 서버는 먼저 운영자인지 DB 에 묻고(아니면 404), 몸통 꼴과 글자 수를 확인해 어긋난 입력은 DB 까지 보내지 않는다.
// 최종 판정(운영자인지·이름 겹침·글자 수)과 「선택지에 넣기」의 크리에이터 바꾸기는 DB 함수가 한 처리 안에서 한다.

const MESSAGES = {
  limit: `태그 이름은 1~${TAG_CUSTOM_MAX}자로 적어 주세요. 보이지 않는 글자는 쓸 수 없어요.`,
  conflict: "같은 이름의 선택지가 이미 있어요.",
  failed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
};

const name = z
  .string()
  .transform((s) => s.trim())
  .refine((s) => charCount(s) >= 1 && charCount(s) <= TAG_CUSTOM_MAX && !HIDDEN_CHAR.test(s));
const id = z.guid();

const bodyShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), name }).strict(),
  z.object({ kind: z.literal("rename"), id, name }).strict(),
  z.object({ kind: z.literal("hide"), id, hidden: z.boolean() }).strict(),
  z.object({ kind: z.literal("move"), id, up: z.boolean() }).strict(),
  z.object({ kind: z.literal("promote"), tag: name }).strict(),
]);

export type TagOptionWrite = z.input<typeof bodyShape>;

function rpcOf(w: z.output<typeof bodyShape>): { fn: string; args: Record<string, unknown> } {
  switch (w.kind) {
    case "add":
      return { fn: "admin_add_creator_tag_option", args: { p_name: w.name } };
    case "rename":
      return { fn: "admin_rename_creator_tag_option", args: { p_id: w.id, p_name: w.name } };
    case "hide":
      return { fn: "admin_set_creator_tag_option_hidden", args: { p_id: w.id, p_hidden: w.hidden } };
    case "move":
      return { fn: "admin_move_creator_tag_option", args: { p_id: w.id, p_up: w.up } };
    case "promote":
      return { fn: "admin_promote_custom_creator_tag", args: { p_tag: w.tag } };
  }
}

/** client = 로그인한 사람의 세션 클라이언트. DB 가 그 토큰의 사람이 운영자인지 본다 — 관리자 키를 쓰면 이 판정이 사라진다. */
export async function saveTagOptions(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  // INV-T1 S1b·INV-T5 S5b: 운영자가 아니면 관리자 주소가 있는 줄도 모르게 404
  if ((await readAdminAccess(client)) === "not_found") return { status: 404, body: { message: MESSAGE_NOT_FOUND } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: MESSAGES.limit } };
  const { fn, args } = rpcOf(shaped.data);
  const { error } = await client.rpc(fn, args);
  if (error) return pgErrorReply(error.code, MESSAGES);
  return { status: 200, body: { ok: true } };
}
