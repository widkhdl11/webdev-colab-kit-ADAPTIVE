"use server";

// 모집글 작성 액션. 본체와 조립은 insert-post.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import { redirect } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action-result";
import { makeCreatePost } from "./insert-post";

const guarded = makeCreatePost();

export async function createPostAction(
  _previous: ActionResult<string> | null,
  form: FormData,
): Promise<ActionResult<string>> {
  const result = await guarded(form);
  if (!result.ok) return result;
  // 성공하면 방금 쓴 모집글로 보낸다. **여기서 `revalidatePath` 를 안 부르는 이유는
  // 다른 주소로 떠나기 때문**이고, 그 화면은 새로 그려진다. 같은 화면에 머무는 액션
  // (신청·수락·메시지)은 그렇지 않아서 `revalidateEntityPath` 로 다시 받아오게 한다 —
  // 「우리 페이지는 다 force-dynamic 이니까」가 근거였다면 그 셋도 지워도 된다는 말이 된다.
  redirect(`/posts/${result.value}`);
}
