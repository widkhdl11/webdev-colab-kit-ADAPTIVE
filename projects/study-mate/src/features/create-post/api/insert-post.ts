// 모집글 작성의 본체. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
// docs/specs/write-authorization.md (INV-Z4 · INV-Z9)
//
// **"use server" 파일과 나눠 둔 이유.** 서버 액션 파일은 모든 내보내기가 액션이 되어
// 클라이언트에서 부를 수 있는 자리가 된다. 판독기·클라이언트를 인자로 여는 조립 함수를
// 거기 두면 그 인자가 요청으로 들어올 수 있는 값이 된다. 그래서 조립은 여기서 하고,
// 액션 파일은 그것을 한 번 부르기만 한다.

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { formText } from "@/shared/lib/form-text";
import { canonicalUuid } from "@/shared/lib/uuid";
import { validatePostText } from "@/entities/post/model/limits";

/**
 * 모집글 한 편을 만든다.
 *
 * **author_id 는 폼에서 오지 않는다** — 가드가 넘겨준 검증된 세션의 값이다 (INV-Z4).
 * 접근 정책도 `author_id = auth.uid()` 를 요구하므로 여기서 틀리면 데이터베이스가 거부한다.
 *
 * **study_id 는 폼에서 온다.** 그 스터디의 호스트인지는 여기서 묻지 않는다 —
 * 접근 정책의 `private.is_study_host(study_id, auth.uid())` 가 판정한다 (INV-Z9).
 * 화면이 고르게 해 주는 목록은 편의고, 그 목록을 무시한 요청도 같은 자리에서 막힌다.
 */
export async function insertPost(
  user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<string>> {
  const studyId = canonicalUuid(form.get("studyId"));
  const title = formText(form, "title");
  const content = formText(form, "content");
  const summary = formText(form, "summary");

  if (!studyId) return { ok: false, message: "어느 스터디의 모집글인지 골라 주세요" };
  // 글칸 셋의 규칙은 엔티티가 갖는다 — 수정 액션이 부르는 것과 같은 함수다.
  const invalid = validatePostText({ title, summary, content });
  if (invalid) return { ok: false, message: invalid };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: user.id, study_id: studyId, title, summary, content })
    .select("id")
    .single();

  // **행이 없는데 오류도 없는 갈래를 따로 본다.** `.single()` 조합에서는 잘 안 나지만,
  // 누군가 `.maybeSingle()` 로 바꾸면 정상 경로가 된다. 전에는 이 자리에서 `dbErrorMessage`
  // 에 null 을 넘겨 **TypeError 를 던졌다** — 서버 액션 밖으로 나가는 예외라 사용자는
  // 폼 오류 대신 500 을 보고 적은 내용을 잃는다.
  if (error) return { ok: false, message: dbErrorMessage("모집글 작성", error) };
  if (!data) {
    console.error("[db] 모집글 작성: 오류 없이 행이 안 돌아왔다");
    return { ok: false, message: "모집글 작성하지 못했습니다. 잠시 뒤 다시 시도해 주세요" };
  }
  return { ok: true, value: (data as { id: string }).id };
}

/**
 * 액션 본체를 세션 확인 뒤로 감춘 것. 액션 파일이 이것을 그대로 쓴다.
 *
 * **가드를 여기서 조립하는 이유는 검사가 붙들 수 있게 하는 것이다.** 판독기를 갈아끼울 수
 * 있으면 "세션이 없을 때 아무것도 쓰지 않는다"를 데이터베이스 없이 확인할 수 있다.
 * 붙들지 **못하는** 것 하나는 밝혀 둔다 — 액션 파일이 이 조립을 안 거치고 `insertPost` 를
 * 직접 부르는 것은 여기서 막을 수 없다(요구는 그대로 남는다: 액션은 이것만 부른다).
 */
export function makeCreatePost(
  readUser: typeof currentUser = currentUser,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): (form: FormData) => Promise<ActionResult<string>> {
  return requireSession(readUser, (user, form: FormData) =>
    insertPost(user, form, createSupabase),
  );
}
