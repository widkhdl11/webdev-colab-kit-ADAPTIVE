"use server";

// 프로필 저장 액션. 본체와 조립은 save-profile.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/shared/lib/action-result";
import { makeSaveProfile } from "./save-profile";

const guarded = makeSaveProfile();

export async function saveProfileAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const result = await guarded(form);
  if (!result.ok) return result;
  // 같은 자리에 머물지 않고 프로필 화면으로 돌아가는데, 그 화면이 방금 고친 값을 보여 줘야
  // 한다. 다른 화면들(모집글 상세의 작성자 이름 등)도 같은 값을 그리므로 함께 다시 받는다.
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  return result;
}
