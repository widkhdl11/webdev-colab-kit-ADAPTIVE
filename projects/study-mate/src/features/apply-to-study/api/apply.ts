"use server";

// 참가 신청 액션. 본체와 조립은 insert-application.ts 에 있다 — 이 파일의 내보내기는
// 전부 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import type { ActionResult } from "@/shared/lib/action-result";
import { makeApply } from "./insert-application";

const guarded = makeApply();

/**
 * 화면이 부르는 자리. 앞의 결과를 첫 인자로 받는 것은 React 의 폼 상태 규약이다
 * (화면이 실패 문구를 그려야 한다).
 *
 * 실패해도 예외를 던지지 않는다 — 던지면 화면이 통째로 오류 페이지가 되어
 * "왜 안 됐는지"를 사용자가 못 읽는다.
 */
export async function applyToStudyAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  return guarded(form);
}
