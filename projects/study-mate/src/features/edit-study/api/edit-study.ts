"use server";

// 스터디 수정 액션. 본체와 조립은 update-study.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import { redirect } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action-result";
import { makeUpdateStudy, type UpdatedStudy } from "./update-study";

const guarded = makeUpdateStudy();

export async function updateStudyAction(
  _previous: ActionResult<UpdatedStudy> | null,
  form: FormData,
): Promise<ActionResult<UpdatedStudy>> {
  const result = await guarded(form);
  if (!result.ok) return result;

  // **모임 일정만 실패했으면 이 화면에 남는다.** 떠나 보내면 「저장됐다」는 인상만 남고
  // 무엇이 안 됐는지는 지나간 뒤에 알게 된다. 여기 남으면 사용자가 바로 다시 누를 수 있고,
  // 본문은 이미 저장됐으니 다시 눌러도 같은 스터디가 하나 더 생기지 않는다
  // (개설 액션이 실패해도 떠나 보내는 이유가 바로 그 반대 사정이었다).
  if (result.value.slotError) return result;

  // 고친 스터디로 돌아간다. 목적지는 **데이터베이스가 돌려준 id** 다 — 폼이 실어 보낸
  // 값으로 만들면 그 자리가 열린 리다이렉트가 된다.
  redirect(`/studies/${result.value.id}`);
}
