"use server";

// 알림 액션. 본체와 조립은 notification-ops.ts 에 있다 — 이 파일의 내보내기는 전부
// 클라이언트가 부를 수 있는 자리이므로, 판독기·클라이언트를 인자로 받는 것을 두지 않는다.

import type { MyNotification } from "@/entities/notification";
import type { ActionResult } from "@/shared/lib/action-result";
import { makeNotificationOps } from "./notification-ops";

const ops = makeNotificationOps();

/** 패널을 열 때 목록을 가져온다. */
export async function loadNotificationsAction(): Promise<ActionResult<readonly MyNotification[]>> {
  return ops.load();
}

export async function markNotificationReadAction(
  form: FormData,
): Promise<ActionResult<{ readonly id: string }>> {
  return ops.markRead(form);
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<null>> {
  return ops.markAllRead();
}

export async function deleteNotificationAction(
  form: FormData,
): Promise<ActionResult<{ readonly id: string }>> {
  return ops.remove(form);
}
