// 알림을 읽음으로 바꾸고 지우는 본체. 근거 스펙: docs/specs/notifications.md
// (INV-N4 · INV-N8) · docs/specs/auth-session.md (INV-A4)
//
// **"use server" 파일과 나눠 둔 이유**는 `features/delete-post` 와 같다 — 액션 파일의
// 내보내기는 전부 클라이언트가 부를 수 있는 자리라, 판독기·클라이언트를 인자로 받는 것을
// 그 파일에 두지 않는다.

import { revalidatePath } from "next/cache";
import { currentUser, requireSession } from "@/entities/session";
import { readMyNotifications } from "@/entities/notification";
import type { MyNotification } from "@/entities/notification";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { canonicalUuid } from "@/shared/lib/uuid";
import { NOTIFICATION_ID_FIELD } from "../model/fields";

/**
 * 알림을 바꾸는 액션이 받는 것들.
 *
 * `revalidateHeader` 가 따로 있는 이유: 종 옆 숫자는 **모든 화면의 머리**에서 다시
 * 세어지는 값이라(INV-N8) 경로 하나를 다시 받게 하는 것으로는 모자란다. 지금 어느 화면에서
 * 패널을 열었는지는 서버가 모르므로, 루트 레이아웃 아래 전부를 다시 받게 한다.
 */
export type NotificationDeps = {
  readonly createSupabase: typeof createServerSupabase;
  readonly revalidateHeader: () => void;
};

export const defaultNotificationDeps: NotificationDeps = {
  createSupabase: createServerSupabase,
  // 두 번째 인자가 "layout" 이라야 그 레이아웃 아래 **모든 경로**가 대상이 된다.
  // "page" 로 두면 「/」 한 장만 다시 그려지고, 다른 화면의 종 옆 숫자는 옛 값으로 남는다.
  //
  // **화면 열여섯이 전부 `force-dynamic` 인데도 필요한 이유**는 서버 캐시가 아니라
  // 클라이언트 라우터 캐시다. 헤더가 루트 레이아웃이 아니라 **페이지마다** 렌더되므로,
  // 비우지 않으면 뒤로 가기로 돌아간 화면이 캐시에 있던 옛 숫자를 그대로 보여 준다 —
  // 그게 INV-N8 위반이다. `router.refresh()` 는 지금 보는 경로만 새로 받으므로
  // 그 화면들을 못 고친다 (2026-09-08 code-reviewer).
  revalidateHeader: () => revalidatePath("/", "layout"),
};

/** 폼이 실어 온 알림 id. 모양이 아니면 null 이다. */
function notificationIdOf(form: FormData): string | null {
  return canonicalUuid(form.get(NOTIFICATION_ID_FIELD));
}

/**
 * 알림 하나를 읽음으로.
 *
 * **누구 것인지를 조건에 안 적는다.** 인가의 주인은 접근 정책이고
 * (`notifications_update_own`), 앱이 같은 조건을 한 벌 더 들면 진짜 방벽이 어디인지
 * 흐려진다. 남의 알림 id 를 실어 보내면 정책이 0행으로 만든다 — 그것을 오류로 만들지
 * 않는 이유는 아래에 있다.
 */
export async function markNotificationRead(
  _user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<{ readonly id: string }>> {
  const id = notificationIdOf(form);
  if (!id) return { ok: false, message: "어느 알림인지 알 수 없습니다" };

  const supabase = await createSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    // **이미 읽은 줄은 다시 안 쓴다.** 없으면 읽은 알림을 누를 때마다 저장된 「읽은 시각」이
    // 지금으로 밀린다. 지금은 null 여부로만 쓰니 티가 안 나지만, 그 시각을 보여 주거나
    // 그것으로 정렬하는 기능이 붙는 순간 값이 조용히 틀어진다 (2026-09-08 code-reviewer)
    .is("read_at", null);

  if (error) return { ok: false, message: dbErrorMessage("알림을 읽음으로 바꾸지", error) };
  // **0행을 실패로 만들지 않는다.** 이미 읽은 알림을 다시 눌러도, 그 사이에 지워진 알림을
  // 눌러도 사용자가 할 일은 없다 — 「읽음」은 그 사람이 원한 상태이고 지금 그 상태다.
  // 모집글 삭제가 0행을 실패로 읽은 것과 갈리는 지점이 여기다: 거기서는 0행이 「글이 아직
  // 있다」는 뜻이라 화면이 거짓말을 하게 된다.
  return { ok: true, value: { id } };
}

/** 안 읽은 알림을 전부 읽음으로. 대상이 자기 것뿐인 것은 접근 정책이 정한다(INV-N4). */
export async function markAllNotificationsRead(
  _user: { readonly id: string },
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<null>> {
  const supabase = await createSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) return { ok: false, message: dbErrorMessage("알림을 모두 읽음으로 바꾸지", error) };
  return { ok: true, value: null };
}

/**
 * 알림 하나를 지운다. **하드 삭제다** — 알림에는 지운 것으로 표시하는 열이 없다(INV-N4).
 *
 * 승인된 시각 기준의 「파괴적 행동은 두 단계」에서 벗어난다. 근거는 잃는 것의 무게다:
 * 알림은 이미 일어난 일의 복사본이라 지워도 참여 상태와 스터디가 그대로 남는다.
 * (2026-09-08 사람 결정 — `docs/design/INTERVIEW.md`)
 */
export async function removeNotification(
  _user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<{ readonly id: string }>> {
  const id = notificationIdOf(form);
  if (!id) return { ok: false, message: "어느 알림인지 알 수 없습니다" };

  const supabase = await createSupabase();
  const { error } = await supabase.from("notifications").delete().eq("id", id);

  if (error) return { ok: false, message: dbErrorMessage("알림을 삭제", error) };
  // 0행은 여기서도 실패가 아니다 — 없는 알림을 지운 결과와 지운 결과가 사용자에게 같다.
  return { ok: true, value: { id } };
}

/** 패널을 열 때 목록을 가져온다. 화면마다 미리 읽지 않는다 — 안 여는 사람이 대부분이다. */
export async function loadNotifications(
  _user: { readonly id: string },
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<readonly MyNotification[]>> {
  try {
    return { ok: true, value: await readMyNotifications(createSupabase) };
  } catch (e) {
    console.error("[db] 알림 목록:", e);
    return { ok: false, message: "알림을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요" };
  }
}

/**
 * 세션 확인 뒤로 본체를 감추고, **성공하면 헤더를 다시 그리게 한다**(INV-N8).
 *
 * 목록을 읽기만 하는 `loadNotifications` 에는 이것을 안 붙인다 — 여는 것만으로 화면 전체가
 * 다시 그려지면, 패널을 열 때마다 지금 보고 있던 화면이 통째로 갱신된다.
 */
export function makeNotificationOps(
  readUser: typeof currentUser = currentUser,
  deps: NotificationDeps = defaultNotificationDeps,
) {
  const withHeader =
    <A extends readonly unknown[], T>(fn: (...args: A) => Promise<ActionResult<T>>) =>
    async (...args: A): Promise<ActionResult<T>> => {
      const result = await fn(...args);
      if (result.ok) deps.revalidateHeader();
      return result;
    };

  return {
    markRead: withHeader(
      requireSession(readUser, (user, form: FormData) =>
        markNotificationRead(user, form, deps.createSupabase),
      ),
    ),
    markAllRead: withHeader(
      requireSession(readUser, (user) => markAllNotificationsRead(user, deps.createSupabase)),
    ),
    remove: withHeader(
      requireSession(readUser, (user, form: FormData) =>
        removeNotification(user, form, deps.createSupabase),
      ),
    ),
    load: requireSession(readUser, (user) => loadNotifications(user, deps.createSupabase)),
  };
}
