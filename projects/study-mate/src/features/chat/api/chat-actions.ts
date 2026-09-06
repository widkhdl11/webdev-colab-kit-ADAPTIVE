"use server";

// 메시지 보내기와 읽음 표시 액션. 본체와 조립은 send-message.ts · mark-read.ts 에 있다 —
// 이 파일의 내보내기는 전부 클라이언트가 부를 수 있는 자리이므로,
// 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import type { ActionResult } from "@/shared/lib/action-result";
import { makeMarkRead } from "./mark-read";
import { makeSendMessage } from "./send-message";

const guardedSend = makeSendMessage();
const guardedRead = makeMarkRead();

export async function sendMessageAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  return guardedSend(form);
}

/** 방을 열면 부른다. 실패해도 화면은 그대로 — 배지 숫자가 하나 늦게 지워질 뿐이다 */
export async function markChatRead(chatId: string): Promise<void> {
  await guardedRead(chatId);
}
