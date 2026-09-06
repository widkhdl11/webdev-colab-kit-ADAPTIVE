// 신청 수락·거절·강퇴와 본인 탈퇴의 본체와 조립.
// 근거 스펙: docs/specs/write-authorization.md (INV-Z2 · Z4 · Z8) ·
//           docs/specs/participation-capacity.md (INV-P1 · P4 · P7 · P8) ·
//           docs/specs/auth-session.md (INV-A4)
//
// `"use server"` 파일과 나눠 둔 이유는 `features/create-post/api/insert-post.ts` 와 같다.

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { revalidateEntityPath } from "@/shared/lib/revalidate-entity";
import { ACTION_NOUN, ALLOWED, type Transition } from "../model/transitions";

const DEFAULT_DEPS: ActionDeps = {
  createSupabase: createServerSupabase,
  revalidate: revalidateEntityPath,
};

export async function changeStatus(
  user: { readonly id: string },
  input: { studyId: string; targetUserId: string; next: Transition },
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<null>> {
  const { studyId, targetUserId, next } = input;
  if (!studyId || !targetUserId) return { ok: false, message: "누구의 신청인지 알 수 없습니다" };
  if (!ALLOWED.includes(next)) return { ok: false, message: "할 수 없는 동작입니다" };

  // 본인 탈퇴는 본인만, 나머지는 호스트만 — 그 판정은 여기가 아니라 접근 정책이 한다.
  // 여기서 막는 것은 화면이 실수로 남의 탈퇴를 보내는 것뿐이고, 계약은 데이터베이스에 있다.
  if (next === "withdrawn" && targetUserId !== user.id) {
    return { ok: false, message: "다른 사람을 대신 탈퇴시킬 수 없습니다" };
  }

  const supabase = await createSupabase();

  // 상태만 보낸다. user_id·study_id 는 갱신 열 권한에 아예 없다 (INV-Z8) —
  // 여기 실수로 끼워 넣어도 데이터베이스가 정책보다 먼저 거부한다.
  const { data, error } = await supabase
    .from("participants")
    .update({ status: next })
    .eq("study_id", studyId)
    .eq("user_id", targetUserId)
    .select("id");

  // 데이터베이스가 지은 문장은 그대로, 나머지는 덮고 서버 로그로 보낸다(db-error.ts).
  // **이 액션이 받는 오류의 대부분이 우리가 지은 한국어 문장이다** — 정원 초과·지워진
  // 스터디·끝난 신청을 되돌리는 것은 전부 트리거가 P0001 로 던진다. 그것을 삼키면
  // 호스트는 「수락했습니다」를 보고 신청자는 영원히 안 들어온다.
  if (error) return { ok: false, message: dbErrorMessage(ACTION_NOUN[next], error) };

  // **0행 갱신은 오류가 아니다.** 정책이 걸러 내면 조용히 아무것도 안 바뀐다 —
  // 그걸 성공으로 보고하면 화면이 "됐다"고 말하고 실제로는 그대로다.
  //
  // 여기로 오는 원인은 둘뿐이다: 그런 신청 행이 없거나, 정책이 거부했거나(호스트도
  // 본인도 아님). **「이미 끝난 신청」은 여기로 오지 않는다** — 끝난 상태를 바꾸려 하면
  // `enforce_participant_transition` 이 예외를 던져 위의 error 갈래로 간다
  // (2026-09-06 code-reviewer: 문구가 도달 불가능한 원인을 말하고 있었다).
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: `${ACTION_NOUN[next]}할 수 없습니다. 그 신청을 찾지 못했거나 권한이 없습니다`,
    };
  }

  return { ok: true, value: null };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 그 스터디 화면을 다시 그리게 한다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 둔다** — 액션 파일에 두면 그 호출을 지워도
 * 전 스위트가 초록불이라(2026-09-06 백로그), 수락은 됐는데 명단이 그대로인 상태가
 * 아무 신호 없이 만들어진다.
 */
export function makeChangeParticipation(
  readUser: typeof currentUser = currentUser,
  deps: ActionDeps = DEFAULT_DEPS,
): (form: FormData) => Promise<ActionResult<null>> {
  const guarded = requireSession(readUser, (user, input: Parameters<typeof changeStatus>[1]) =>
    changeStatus(user, input, deps.createSupabase),
  );
  return async (form: FormData) => {
    const studyId = String(form.get("studyId") ?? "");
    const result = await guarded({
      studyId,
      targetUserId: String(form.get("targetUserId") ?? ""),
      next: String(form.get("next") ?? "") as Transition,
    });
    if (result.ok) deps.revalidate("/studies", studyId);
    return result;
  };
}
