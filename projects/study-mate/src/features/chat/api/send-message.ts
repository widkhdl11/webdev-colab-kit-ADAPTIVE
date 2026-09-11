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
import { hasBidiFormatting, hasControlChars, hasVisibleContent } from "@/shared/lib/text";
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

  // **판정 순서는 세 자리(메시지·이름·제목)가 같아야 한다.** 같은 값에 화면마다 다른
  // 설명이 나가면 한쪽은 막다른 길이 된다 — 「전각 공백 + RLO」에 「쓸 수 없는 글자가
  // 있습니다」를 주면 사용자 눈에는 칸이 비어 있는데 지울 것을 찾으라는 말이 된다.
  // 순서는 **보이는 내용 → 길이 → 제어문자 → 서식 문자**다(2026-09-11 code-reviewer).
  //
  // 강제 위치는 전부 데이터베이스이고 여기는 문구를 위한 자리다 — 제약이 거부하면 나오는
  // 것이 영어 원문이라 화면에 못 내보내고, 덮어쓴 문구가 「잠시 뒤 다시 시도해 주세요」라서
  // 절대 성공하지 않는 요청에 기다리라고 말하게 된다.
  //
  // `content === ""` 를 따로 안 본다 — `hasVisibleContent("")` 가 이미 거짓이다.
  if (!hasVisibleContent(content)) {
    return { ok: false, message: "보낼 내용을 적어 주세요" };
  }
  // **코드 포인트로 센다.** `content.length` 는 UTF-16 코드 단위라 이모지 하나가 2로
  // 세지는데, 스키마의 `char_length` 는 코드 포인트다. 두 자리가 다른 단위로 세면
  // 「같은 숫자다」가 경계에서 참이 아니게 된다 — 이모지 1001개짜리 메시지를 앱만 막는다.
  if ([...content].length > MESSAGE_MAX) {
    return { ok: false, message: `메시지는 ${MESSAGE_MAX}자까지 보낼 수 있습니다` };
  }
  // 제어문자(INV-M4)와 양방향 서식 문자(INV-T2). **문구가 다음에 할 일을 준다** — 이 값들은
  // 화면에서 안 보이므로 「글자가 있습니다」만 말하면 지울 대상을 못 찾는다. 들어오는 경로가
  // 거의 붙여 넣기라(스프레드시트 셀을 복사하면 탭이 그대로 남는다) 직접 입력이 실제로 통한다.
  if (hasControlChars(content) || hasBidiFormatting(content)) {
    return { ok: false, message: "화면에 안 보이는 글자가 섞여 있습니다. 붙여 넣지 말고 직접 입력해 주세요" };
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
