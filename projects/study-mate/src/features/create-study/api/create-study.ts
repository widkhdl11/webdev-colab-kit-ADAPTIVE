"use server";

// 스터디 개설 액션. 본체와 조립은 insert-study.ts 에 있다 — 이 파일의 내보내기는
// 전부 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import { redirect } from "next/navigation";
import type { ActionResult } from "@/shared/lib/action-result";
import { type CreatedStudy, makeCreateStudy } from "./insert-study";

const guarded = makeCreateStudy();

export async function createStudyAction(
  _previous: ActionResult<CreatedStudy> | null,
  form: FormData,
): Promise<ActionResult<CreatedStudy>> {
  const result = await guarded(form);
  if (!result.ok) return result;
  // 만들어진 스터디로 떠난다. redirect 는 예외를 던져서 흐름을 끊으므로 이 아래는 없다 —
  // 그래서 캐시 지우기를 여기 두지 않는다(그 화면은 새로 그려진다).
  //
  // 일정 저장만 실패했으면 **그래도 그 스터디로 보낸다.** 폼에 남겨 두면 사용자가 다시
  // 제출해 같은 스터디를 하나 더 만든다. 무엇이 빠졌는지는 도착한 화면이 말한다.
  const { id, slotError } = result.value;
  redirect(slotError ? `/studies/${id}?slots=failed` : `/studies/${id}`);
}
