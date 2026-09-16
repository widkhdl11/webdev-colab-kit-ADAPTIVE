// 좋아요 토글의 본체와 조립. 근거 스펙: docs/specs/post-likes.md (INV-L1 · INV-L3) ·
// docs/specs/auth-session.md (INV-A4) · docs/specs/write-authorization.md (INV-Z4)
//
// `"use server"` 파일과 나눠 둔 이유는 `features/apply-to-study/api/insert-application.ts`
// 와 같다 — 액션 파일의 내보내기는 전부 클라이언트가 부를 수 있는 자리가 된다.
//
// **계약은 여기 없다.** 누가 누구의 좋아요를 만들고 지울 수 있는지는 `likes` 의 접근 정책이
// 판정한다(`likes_write_self` · `likes_del_self`, 0001_init.sql:533). 여기서 하는 일은
// 화면에 보여 줄 이유를 만드는 것과, 상태를 뒤집는 것뿐이다.

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { revalidateEntityPath } from "@/shared/lib/revalidate-entity";

const DEFAULT_DEPS: ActionDeps = {
  createSupabase: createServerSupabase,
  revalidate: revalidateEntityPath,
};

/** 토글이 끝난 뒤의 내 상태. 화면은 이것으로 버튼 모양을 정한다. */
export type LikeToggled = { readonly liked: boolean };

/**
 * 좋아요를 누르거나 취소한다.
 *
 * **사용자 아이디를 인자로 받지 않는다** — 가드가 넘겨주는 검증된 세션의 값만 쓴다(INV-Z4).
 *
 * **유일 제약 위반(23505)은 실패로 안 돌려준다.** 같은 요청이 두 번 도착했다는 뜻이고,
 * 그때 사용자가 원한 상태(눌림)는 이미 이뤄져 있다. 알릴 실패가 없다 — 스펙 S6 가
 * 「그 실패가 사용자에게 에러로 나가면 안 된다」고 적은 자리다. 다른 코드는 그대로 올린다.
 */
export async function toggleLike(
  user: { readonly id: string },
  postId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<LikeToggled>> {
  if (!postId) return { ok: false, message: "어느 모집글인지 알 수 없습니다" };

  const supabase = await createSupabase();

  // 지금 눌러 둔 것이 있는지 본다. 이 조회와 아래 쓰기 사이에 남이 끼어들 수 있는데,
  // 그 경우도 결과는 「한 번 누른 것」으로 수렴한다 — insert 는 23505 를 삼키고,
  // delete 는 없는 행을 지워도 오류가 아니다.
  const { data: mine } = await supabase
    .from("likes")
    .select("id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (mine) {
    const { error } = await supabase.from("likes").delete().eq("post_id", postId).eq("user_id", user.id);
    if (error) return { ok: false, message: dbErrorMessage("좋아요 취소", error) };
    return { ok: true, value: { liked: false } };
  }

  const { error } = await supabase.from("likes").insert({ post_id: postId, user_id: user.id });
  if (error && error.code !== "23505") {
    if (error.code === "42501") return { ok: false, message: "지금은 좋아요를 누를 수 없습니다" };
    return { ok: false, message: dbErrorMessage("좋아요", error) };
  }
  return { ok: true, value: { liked: true } };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 그 모집글 화면을 다시 그리게 한다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 둔다** — 액션 파일에 두면 그 호출을 지워도
 * 전 스위트가 초록불이다(2026-09-06 백로그). 여기 있으면 주입한 가짜로 확인할 수 있다.
 */
export function makeToggleLike(
  readUser: typeof currentUser = currentUser,
  deps: ActionDeps = DEFAULT_DEPS,
): (form: FormData) => Promise<ActionResult<LikeToggled>> {
  const guarded = requireSession(readUser, (user, postId: string) =>
    toggleLike(user, postId, deps.createSupabase),
  );
  return async (form: FormData) => {
    const postId = String(form.get("postId") ?? "");
    const result = await guarded(postId);
    if (result.ok) deps.revalidate("/posts", postId);
    return result;
  };
}
