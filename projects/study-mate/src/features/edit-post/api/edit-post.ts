"use server";

// 모집글 수정 액션. 본체와 조립은 update-post.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import { redirect } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action-result";
import { makeUpdatePost } from "./update-post";

const guarded = makeUpdatePost();

export async function updatePostAction(
  _previous: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const result = await guarded(form);
  if (!result.ok) return result;
  // 고친 글로 돌아간다. 목적지는 **데이터베이스가 돌려준 id** 다 — 폼이 실어 보낸 값으로
  // 만들면 그 자리가 열린 리다이렉트가 된다.
  redirect(`/posts/${result.value}`);
}
