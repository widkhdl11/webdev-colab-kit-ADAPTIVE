"use server";

// 모집글 삭제 액션. 본체와 조립은 remove-post.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import { redirect } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action-result";
import { makeRemovePost, type RemovedPost } from "./remove-post";

const guarded = makeRemovePost();

export async function deletePostAction(
  _previous: ActionResult<RemovedPost> | null,
  form: FormData,
): Promise<ActionResult<RemovedPost>> {
  const result = await guarded(form);
  if (!result.ok) return result;
  // 글은 이제 없으므로 그 글이 붙어 있던 스터디로 보낸다. 목적지는 **데이터베이스가
  // 돌려준 값**이다 — 폼이 실어 보낸 값으로 만들면 그 자리가 열린 리다이렉트가 된다.
  redirect(`/studies/${result.value.studyId}`);
}
