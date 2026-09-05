"use server";

// 메시지 보내기와 읽음 표시.
// 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
//           docs/specs/write-authorization.md (INV-Z4 · Z8) ·
//           docs/specs/participation-capacity.md (INV-P8 — 멤버만 읽고 쓴다)

import { revalidatePath } from "next/cache";
import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";

const MAX_LENGTH = 2000;

async function insertMessage(
  user: { readonly id: string },
  input: { chatId: string; content: string },
): Promise<ActionResult<null>> {
  const content = input.content.trim();
  if (!input.chatId) return { ok: false, message: "어느 방인지 알 수 없습니다" };
  if (content === "") return { ok: false, message: "보낼 내용을 적어 주세요" };
  if (content.length > MAX_LENGTH) {
    return { ok: false, message: `메시지는 ${MAX_LENGTH}자까지 보낼 수 있습니다` };
  }

  const supabase = await createServerSupabase();

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
    return { ok: false, message: `보내지 못했습니다: ${error.message}` };
  }

  return { ok: true, value: null };
}

async function touchLastRead(
  user: { readonly id: string },
  chatId: string,
): Promise<ActionResult<null>> {
  if (!chatId) return { ok: false, message: "어느 방인지 알 수 없습니다" };

  const supabase = await createServerSupabase();
  // 갱신할 수 있는 열이 last_read_at 하나뿐이다 (INV-Z8) — chat_id 를 바꿔
  // 남의 방으로 옮기는 경로가 여기서 열릴 수 없다.
  const { error } = await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("user_id", user.id);

  if (error) return { ok: false, message: `읽음 표시에 실패했습니다: ${error.message}` };
  return { ok: true, value: null };
}

const guardedSend = requireSession(currentUser, insertMessage);
const guardedRead = requireSession(currentUser, touchLastRead);

export async function sendMessageAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const chatId = String(form.get("chatId") ?? "");
  const result = await guardedSend({ chatId, content: String(form.get("content") ?? "") });
  if (result.ok && chatId) revalidatePath(`/chats/${chatId}`);
  return result;
}

/** 방을 열면 부른다. 실패해도 화면은 그대로 — 배지 숫자가 하나 늦게 지워질 뿐이다 */
export async function markChatRead(chatId: string): Promise<void> {
  await guardedRead(chatId);
}
