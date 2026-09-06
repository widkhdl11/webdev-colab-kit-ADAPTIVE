"use server";

// 신청 수락·거절·강퇴와 본인 탈퇴 액션. 본체와 조립은 change-status.ts 에 있다 —
// 이 파일의 내보내기는 전부 클라이언트가 부를 수 있는 자리이므로,
// 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import type { ActionResult } from "@/shared/lib/action-result";
import { makeChangeParticipation } from "./change-status";

const guarded = makeChangeParticipation();

export async function changeParticipationAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  return guarded(form);
}
