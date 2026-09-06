"use server";

// 프로필 저장 액션. 본체와 조립은 save-profile.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import type { ActionResult } from "@/shared/lib/action-result";
import { makeSaveProfile } from "./save-profile";

const guarded = makeSaveProfile();

export async function saveProfileAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  return guarded(form);
}
