// 읽음 표시의 본체와 조립. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
//                                   docs/specs/write-authorization.md (INV-Z8) ·
//                                   docs/specs/chat-message-integrity.md (INV-M2)

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ReadDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";

const DEFAULT_DEPS: ReadDeps = { createSupabase: createServerSupabase };

/**
 * 읽음 시각 자리에 보내는 값. **시각을 앱이 만들지 않는다 (INV-M2)** — 0021 의 트리거가
 * 데이터베이스 시계로 찍는다. 안 읽은 수는 `chat_messages.created_at` 과 이 값을 비교해서
 * 세는데(`read-chats.ts:132`), 앱 서버와 데이터베이스는 다른 기계라 시계가 어긋난다.
 * 앱이 빠르면 그 차이만큼 뒤에 온 메시지가 영원히 안 읽음으로 안 뜨고, 느리면 이미 읽은
 * 것이 다시 올라온다. 오류는 어느 쪽에서도 안 난다.
 *
 * `null` 인 이유는 둘이다. ① PostgREST 는 갱신할 열이 하나는 있어야 요청을 만든다
 * ② 트리거가 사라지면 이 값이 그대로 저장되고, `read-chats.ts:132` 가 그때 `.gt()` 를
 * 안 걸어 **그 방의 모든 메시지를 안 읽음으로 센다** — 화면에서 바로 보인다.
 * 여기서 앱 시각을 보내면 트리거가 사라져도 옛 동작으로 조용히 돌아가고, 그게 이 스펙이
 * 막으려던 상태다.
 */
const STAMPED_BY_DB = null;

export async function touchLastRead(
  user: { readonly id: string },
  chatId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<null>> {
  if (!chatId) return { ok: false, message: "어느 방인지 알 수 없습니다" };

  const supabase = await createSupabase();
  // 갱신할 수 있는 열이 last_read_at 하나뿐이다 (INV-Z8) — chat_id 를 바꿔
  // 남의 방으로 옮기는 경로가 여기서 열릴 수 없다.
  //
  // **대상을 지목하는 조건에 세션의 user_id 가 들어간다.** 이게 빠지면 그 방의 모든 사람의
  // 읽음 시각을 한 번에 미는 갱신이 된다 — 정책이 막아 주더라도 우리가 보내는 문장 자체가
  // 틀린 것이라 남겨 둘 이유가 없다.
  //
  // 보내는 값은 `STAMPED_BY_DB` 다 — 아래 상수의 주석에 이유가 있다 (INV-M2).
  const { error } = await supabase
    .from("chat_participants")
    .update({ last_read_at: STAMPED_BY_DB })
    .eq("chat_id", chatId)
    .eq("user_id", user.id);

  // **여기서 0행은 성공으로 본다.** 바로 옆 `change-status.ts` 는 0행을 실패로 보는데,
  // 그 액션은 결과가 호스트 화면의 문구가 되기 때문이다. 이쪽은 부르는 자리
  // (`markChatRead`)가 결과를 안 쓰고, 방 멤버가 아니면 0행이 정상이다. `.select()` 를
  // 붙여 행 수를 세도 아무도 그 값을 안 읽으므로 왕복만 늘어난다
  // (2026-09-06 code-reviewer: 두 액션이 다른 답을 갖는 이유를 적어 둔다).
  if (error) return { ok: false, message: dbErrorMessage("읽음 표시", error) };
  return { ok: true, value: null };
}

/** 세션 확인 뒤로 본체를 감춘 것. 액션 파일이 이것을 그대로 쓴다 */
export function makeMarkRead(
  readUser: typeof currentUser = currentUser,
  deps: ReadDeps = DEFAULT_DEPS,
): (chatId: string) => Promise<ActionResult<null>> {
  return requireSession(readUser, (user, chatId: string) =>
    touchLastRead(user, chatId, deps.createSupabase),
  );
}
