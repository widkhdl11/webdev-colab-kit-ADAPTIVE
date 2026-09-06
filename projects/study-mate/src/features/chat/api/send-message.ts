// 메시지 보내기의 본체와 조립.
// 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
//           docs/specs/write-authorization.md (INV-Z4 · Z8) ·
//           docs/specs/participation-capacity.md (INV-P8 — 멤버만 읽고 쓴다)
//
// `"use server"` 파일과 나눠 둔 이유는 `features/create-post/api/insert-post.ts` 와 같다.

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { revalidateEntityPath } from "@/shared/lib/revalidate-entity";
import { MESSAGE_MAX } from "../model/limits";

const DEFAULT_DEPS: ActionDeps = {
  createSupabase: createServerSupabase,
  revalidate: revalidateEntityPath,
};

export async function insertMessage(
  user: { readonly id: string },
  input: { chatId: string; content: string },
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<null>> {
  const content = input.content.trim();
  if (!input.chatId) return { ok: false, message: "어느 방인지 알 수 없습니다" };
  if (content === "") return { ok: false, message: "보낼 내용을 적어 주세요" };
  if (content.length > MESSAGE_MAX) {
    return { ok: false, message: `메시지는 ${MESSAGE_MAX}자까지 보낼 수 있습니다` };
  }

  const supabase = await createSupabase();

  // sender_id 는 폼에서 오지 않는다 — 가드가 넘겨준 검증된 세션의 값이다 (INV-Z4).
  // 방의 멤버인지는 접근 정책이 판정한다(messages_send_member). 강퇴된 사람은
  // 그 순간 채팅 구성원에서 빠지므로(INV-P8) 여기서 따로 확인하지 않는다.
  const { error } = await supabase
    .from("chat_messages")
    .insert({ chat_id: input.chatId, sender_id: user.id, content });

  if (error) {
    if (error.code === "42501") {
      return { ok: false, message: "이 방의 멤버가 아니라 메시지를 보낼 수 없습니다" };
    }
    // 그 밖의 거부(트리거·네트워크)도 실패로 돌려준다. 삼키면 화면은 「보냈습니다」를
    // 말하고 메시지는 사라진다 (2026-09-06 test-auditor).
    return { ok: false, message: dbErrorMessage("보내기", error) };
  }

  return { ok: true, value: null };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 그 방 화면을 다시 그리게 한다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 둔다** — 액션 파일에 두면 그 호출을 지워도
 * 전 스위트가 초록불이다(2026-09-06 백로그).
 */
export function makeSendMessage(
  readUser: typeof currentUser = currentUser,
  deps: ActionDeps = DEFAULT_DEPS,
): (form: FormData) => Promise<ActionResult<null>> {
  const guarded = requireSession(readUser, (user, input: { chatId: string; content: string }) =>
    insertMessage(user, input, deps.createSupabase),
  );
  return async (form: FormData) => {
    const chatId = String(form.get("chatId") ?? "");
    const result = await guarded({ chatId, content: String(form.get("content") ?? "") });
    if (result.ok) deps.revalidate("/chats", chatId);
    return result;
  };
}
