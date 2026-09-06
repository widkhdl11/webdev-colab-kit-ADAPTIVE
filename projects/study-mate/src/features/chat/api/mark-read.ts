// 읽음 표시의 본체와 조립. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
//                                   docs/specs/write-authorization.md (INV-Z8)

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ReadDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";

const DEFAULT_DEPS: ReadDeps = { createSupabase: createServerSupabase };

export async function touchLastRead(
  user: { readonly id: string },
  chatId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
  now: () => string = () => new Date().toISOString(),
): Promise<ActionResult<null>> {
  if (!chatId) return { ok: false, message: "어느 방인지 알 수 없습니다" };

  const supabase = await createSupabase();
  // 갱신할 수 있는 열이 last_read_at 하나뿐이다 (INV-Z8) — chat_id 를 바꿔
  // 남의 방으로 옮기는 경로가 여기서 열릴 수 없다.
  //
  // **대상을 지목하는 조건에 세션의 user_id 가 들어간다.** 이게 빠지면 그 방의 모든 사람의
  // 읽음 시각을 한 번에 미는 갱신이 된다 — 정책이 막아 주더라도 우리가 보내는 문장 자체가
  // 틀린 것이라 남겨 둘 이유가 없다.
  const { error } = await supabase
    .from("chat_participants")
    .update({ last_read_at: now() })
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
