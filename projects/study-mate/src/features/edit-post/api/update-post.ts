// 모집글 수정의 본체. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
// docs/specs/write-authorization.md (INV-Z3 · INV-Z4 · INV-Z8)
//
// **"use server" 파일과 나눠 둔 이유**는 `features/create-post` 와 같다 — 액션 파일의
// 내보내기는 전부 클라이언트가 부를 수 있는 자리라, 판독기·클라이언트를 인자로 여는 조립을
// 거기 두면 그 인자가 요청으로 들어올 수 있는 값이 된다.

import { currentUser, requireSession } from "@/entities/session";
import { validatePostText } from "@/entities/post/model/limits";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { defaultPathDeps, type PathDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { formText } from "@/shared/lib/form-text";
import { canonicalUuid } from "@/shared/lib/uuid";

/**
 * 내가 쓴 모집글 한 편의 제목·한 줄 소개·내용을 고친다.
 *
 * **고칠 대상을 「그 글」이자 「내가 쓴 글」로 좁힌다** (INV-Z3). 갱신 정책
 * (`posts_update_author`)이 `author_id = auth.uid()` 를 양쪽으로 요구하므로 이 줄이 빠져도
 * 남의 글은 안 바뀐다 — **인가의 주인은 정책이고, 이 줄은 앱 경로에 한 겹 더 두는 것**이다.
 *
 * 사용자가 읽는 문구는 어느 쪽이든 같다(정책의 `using` 에 걸린 행은 오류가 아니라 갱신
 * 0행으로 떨어진다 — 그래서 아래 「0행」 갈래가 두 경우를 같이 받는다). 그래도 두는 이유는,
 * 이 줄이 없으면 **인가를 지키는 것이 데이터베이스 하나뿐**이 되기 때문이다.
 * (2026-09-06 security-reviewer 가 처음 적어 둔 근거를 고쳤다 — 「정책에만 맡기면 오류로
 * 온다」는 사실이 아니었다)
 *
 * **작성자와 스터디는 갱신에 안 싣는다** (INV-Z8). 데이터베이스의 갱신 권한도 세 칸뿐이라
 * (`grant update (title, summary, content) on public.posts`) 넷째 칸을 실으면 요청이 통째로
 * 거부된다. 모집글을 다른 스터디로 옮길 수 없다는 것이 계약이고, 그래서 폼에도 그 칸이 없다.
 */
export async function updatePost(
  user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<string>> {
  const postId = canonicalUuid(form.get("postId"));
  const title = formText(form, "title");
  const content = formText(form, "content");
  const summary = formText(form, "summary");

  if (!postId) return { ok: false, message: "어느 모집글을 고치는지 알 수 없습니다" };
  // 글칸 셋의 규칙은 엔티티가 갖는다 — 작성 액션이 부르는 것과 같은 함수다.
  const invalid = validatePostText({ title, summary, content });
  if (invalid) return { ok: false, message: invalid };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("posts")
    // 한 줄 소개를 비우면 null 이다 — 작성 때와 같은 규칙이라야 「지웠다」가 저장된다.
    .update({ title, summary, content })
    .eq("id", postId)
    .eq("author_id", user.id)
    .select("id")
    .maybeSingle();

  // **지워진 스터디의 내 모집글은 여기서 막지 않는다.** 수정 화면은 404 로 막지만
  // (`read-post-for-edit.ts`) 액션에는 그 조건이 없어서, 액션을 직접 부르면 고쳐진다.
  // 불변식 위반은 아니다 — INV-Z10 이 막는 것은 새 신청·새 수락·새 모집글이고 기존 글의
  // 수정은 아무도 정한 적이 없다. 피해도 없다(그 글은 작성자 말고 아무에게도 안 보인다).
  // **스펙이 정한 적 없다는 것이 요점**이라 백로그에 올렸다 (2026-09-06 security-reviewer).
  if (error) return { ok: false, message: dbErrorMessage("모집글을 수정", error) };
  // **0행은 오류가 아니다.** 없는 글이거나 남의 글이면 갱신이 아무것도 안 맞히고 조용히
  // 끝난다(정책의 `using` 에 걸린 행도 오류가 아니라 여기로 온다). 이 갈래를 성공으로
  // 읽으면 "저장했습니다"가 나가면서 아무것도 안 바뀐다.
  //
  // 원인이 하나 더 있는데 지금은 도달할 수 없다 — **갱신은 됐지만 조회 정책이 그 행을 안
  // 돌려주는** 경우다. 작성자는 곧 그 스터디의 호스트이고(INV-Z9) `study_is_visible` 이
  // 호스트에게 참이라 지금은 안 난다. 호스트를 넘길 수 있게 되는 날 이 자리가 열린다.
  if (!data) {
    return { ok: false, message: "고칠 수 있는 모집글이 아닙니다. 내가 쓴 글인지 확인해 주세요" };
  }
  return { ok: true, value: (data as { id: string }).id };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 고친 값이 나오는 화면들을 다시 받게 한다.
 *
 * **작성 액션은 캐시를 안 지우는데 수정은 지운다.** 작성은 방금 생긴 주소로 떠나므로 그
 * 화면이 처음 그려지지만, 수정은 **이미 있던 주소로 돌아간다** — 라우터가 들고 있던 옛
 * 화면이 그대로 나오면 사용자는 저장이 안 된 줄 안다. 목록과 프로필도 제목을 그린다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 두는 이유**는 검사가 붙들 수 있게 하는 것이다 —
 * 액션 파일에 두면 그 줄을 지워도 전 스위트가 초록불이다 (2026-09-06 code-reviewer).
 */
export function makeUpdatePost(
  readUser: typeof currentUser = currentUser,
  deps: PathDeps = defaultPathDeps,
): (form: FormData) => Promise<ActionResult<string>> {
  const guarded = requireSession(readUser, (user, form: FormData) =>
    updatePost(user, form, deps.createSupabase),
  );
  return async (form: FormData) => {
    const result = await guarded(form);
    // **고친 값이 나오는 화면 전부다.** 홈도 최신 세 장의 제목·한 줄 소개를 그리고
    // (`app/page.tsx` → `readLatestPosts(3)`), 프로필은 「내가 쓴 모집글」에 제목을 그린다.
    // 스터디 상세는 안 넣는다 — 그 화면은 모집글의 **존재 여부만** 읽고 제목은 안 그린다.
    if (result.ok) deps.revalidatePaths(`/posts/${result.value}`, "/posts", "/profile", "/");
    return result;
  };
}
