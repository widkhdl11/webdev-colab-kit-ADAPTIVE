// 모집글 삭제의 본체. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
// docs/specs/write-authorization.md (INV-Z3 · INV-Z4)
//
// **"use server" 파일과 나눠 둔 이유**는 `features/edit-post` 와 같다 — 액션 파일의
// 내보내기는 전부 클라이언트가 부를 수 있는 자리다.

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { defaultPathDeps, type PathDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { canonicalUuid } from "@/shared/lib/uuid";

/**
 * 내가 쓴 모집글 한 편을 지운다. **하드 삭제다** — 스터디의 삭제(INV-Z6, 표시만 하고 행은
 * 남긴다)와 다르고, 이 글에 달린 좋아요도 `on delete cascade` 로 같이 사라진다.
 * 그 차이의 근거는 아직 문서에 없다(보류 P15) — 지금 동작을 그대로 화면에 연 것뿐이다.
 *
 * **지울 대상을 「그 글」이자 「내가 쓴 글」로 좁힌다** (INV-Z3). 삭제 정책
 * (`posts_delete_author`)이 `author_id = auth.uid()` 를 요구하므로 이 줄이 빠져도 남의 글은
 * 안 지워진다 — 인가의 주인은 정책이고, 이 줄은 앱 경로에 한 겹 더 두는 것이다.
 *
 * **돌려주는 것은 그 글이 붙어 있던 스터디의 id 다.** 글은 이제 없으므로 사용자를 보낼
 * 곳이 그 스터디이고, **그 값은 데이터베이스가 알려 준 것이어야 한다** — 폼이 실어 보낸
 * 값으로 만들면 그 자리가 열린 리다이렉트가 된다.
 */
export type RemovedPost = {
  /** 지운 글. 그 글의 상세 캐시를 지우는 데 쓴다 */
  readonly postId: string;
  /** 그 글이 붙어 있던 스터디. 사용자를 보낼 곳이다 */
  readonly studyId: string;
};

export async function removePost(
  user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<RemovedPost>> {
  const postId = canonicalUuid(form.get("postId"));
  if (!postId) return { ok: false, message: "어느 모집글을 지우는지 알 수 없습니다" };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", user.id)
    .select("id, study_id")
    .maybeSingle();

  if (error) return { ok: false, message: dbErrorMessage("모집글을 삭제", error) };
  // **0행은 오류가 아니다.** 없는 글이거나 남의 글이면 삭제가 아무것도 안 맞히고 조용히
  // 끝난다(정책에 걸린 행도 여기로 온다). 성공으로 읽으면 「지웠습니다」가 나가면서
  // 글은 그대로 남는다 — 수정 액션이 0행에 내린 판단과 같다.
  //
  // **원인이 하나 더 있고, 삭제에서는 그것이 수정보다 가깝다** — 지우기는 됐는데
  // `.select()` 가 그 행을 안 돌려주는 경우다. 돌려주는 것은 이미 사라진 행이고
  // `posts_read` 를 지나야 나온다. 지금은 작성자가 곧 호스트라(INV-Z9) `study_is_visible`
  // 이 참이므로 안 나지만, 호스트를 넘길 수 있게 되는 날 **글은 지워졌는데 화면은
  // 「지울 수 있는 모집글이 아닙니다」를 띄우고 캐시도 안 지워지는** 상태가 된다
  // (2026-09-06 code-reviewer).
  if (!data) {
    return { ok: false, message: "지울 수 있는 모집글이 아닙니다. 내가 쓴 글인지 확인해 주세요" };
  }
  // **모양을 확인하고 쓴다.** 이 값들이 그대로 `Location` 헤더와 캐시 경로가 된다.
  // 오늘은 둘 다 `uuid not null` 이라 안전하지만, `.select()` 를 다른 열로 바꾸는 날
  // `as` 캐스트는 타입 검사를 통과시키고 `/studies/undefined` 로 조용히 보낸다
  // (2026-09-06 security-reviewer). 형제 판독기가 임베드에 하는 것과 같은 확인이다.
  const row = data as { id?: unknown; study_id?: unknown };
  if (typeof row.id !== "string" || typeof row.study_id !== "string") {
    console.error("[db] 모집글 삭제: 지운 행의 모양이 다르다");
    return { ok: false, message: "모집글을 삭제하지 못했습니다. 잠시 뒤 다시 시도해 주세요" };
  }
  return { ok: true, value: { postId: row.id, studyId: row.study_id } };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 그 글이 나오던 화면 다섯을 다시 받게 한다.
 *
 * **지운 글의 상세(`/posts/[id]`)도 지운다.** 처음에는 「그 주소는 이제 404 니까 지울
 * 대상이 아니다」로 뺐는데 틀렸다 — `revalidatePath` 가 지우는 것은 그 주소의 응답이
 * 아니라 **라우터가 들고 있던 항목**이다. 삭제까지 오는 길이 상세 → 수정 → 삭제라 그
 * 항목이 거의 항상 캐시에 있고, **뒤로 가기가 지워진 글을 신청 버튼째로 그린다**
 * (2026-09-06 code-reviewer).
 *
 * 나머지 넷: 목록 · 프로필의 「내가 쓴 모집글」 · 홈의 최신 세 장 · 그 스터디의 상세
 * (모집글이 0장이 되면 「모집글 쓰기」가 주 행동으로 바뀐다).
 */
export function makeRemovePost(
  readUser: typeof currentUser = currentUser,
  deps: PathDeps = defaultPathDeps,
): (form: FormData) => Promise<ActionResult<RemovedPost>> {
  const guarded = requireSession(readUser, (user, form: FormData) =>
    removePost(user, form, deps.createSupabase),
  );
  return async (form: FormData) => {
    const result = await guarded(form);
    if (result.ok) {
      deps.revalidatePaths(
        `/posts/${result.value.postId}`,
        "/posts",
        "/profile",
        "/",
        `/studies/${result.value.studyId}`,
      );
    }
    return result;
  };
}
