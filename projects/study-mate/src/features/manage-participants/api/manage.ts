"use server";

// 신청 수락·거절·강퇴와 본인 탈퇴.
// 근거 스펙: docs/specs/write-authorization.md (INV-Z2 · Z4 · Z8) ·
//           docs/specs/participation-capacity.md (INV-P1 · P4 · P7 · P8) ·
//           docs/specs/auth-session.md (INV-A4)

import { revalidatePath } from "next/cache";
import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";

/**
 * 화면이 시킬 수 있는 상태 변경. 다섯 값 중 `pending` 은 여기 없다 —
 * 신청을 만드는 것은 다른 액션(참가 신청)이고, 되돌아가는 전이는 없다(INV-P7).
 */
const ALLOWED = ["accepted", "rejected", "kicked", "withdrawn"] as const;
type Transition = (typeof ALLOWED)[number];

const MESSAGE: Readonly<Record<Transition, string>> = {
  accepted: "수락",
  rejected: "거절",
  kicked: "내보내기",
  withdrawn: "탈퇴",
};

async function changeStatus(
  user: { readonly id: string },
  input: { studyId: string; targetUserId: string; next: Transition },
): Promise<ActionResult<null>> {
  const { studyId, targetUserId, next } = input;
  if (!studyId || !targetUserId) return { ok: false, message: "누구의 신청인지 알 수 없습니다" };
  if (!ALLOWED.includes(next)) return { ok: false, message: "할 수 없는 동작입니다" };

  // 본인 탈퇴는 본인만, 나머지는 호스트만 — 그 판정은 여기가 아니라 접근 정책이 한다.
  // 여기서 막는 것은 화면이 실수로 남의 탈퇴를 보내는 것뿐이고, 계약은 데이터베이스에 있다.
  if (next === "withdrawn" && targetUserId !== user.id) {
    return { ok: false, message: "다른 사람을 대신 탈퇴시킬 수 없습니다" };
  }

  const supabase = await createServerSupabase();

  // 상태만 보낸다. user_id·study_id 는 갱신 열 권한에 아예 없다 (INV-Z8) —
  // 여기 실수로 끼워 넣어도 데이터베이스가 정책보다 먼저 거부한다.
  const { data, error } = await supabase
    .from("participants")
    .update({ status: next })
    .eq("study_id", studyId)
    .eq("user_id", targetUserId)
    .select("id");

  if (error) {
    if (error.code === "23514" || error.message.includes("check_violation")) {
      return { ok: false, message: `${MESSAGE[next]}할 수 없습니다: ${error.message}` };
    }
    return { ok: false, message: `${MESSAGE[next]}하지 못했습니다: ${error.message}` };
  }

  // **0행 갱신은 오류가 아니다.** 정책이 걸러 내면 조용히 아무것도 안 바뀐다 —
  // 그걸 성공으로 보고하면 화면이 "됐다"고 말하고 실제로는 그대로다.
  if (!data || data.length === 0) {
    return { ok: false, message: `${MESSAGE[next]}할 권한이 없거나 이미 끝난 신청입니다` };
  }

  return { ok: true, value: null };
}

const guarded = requireSession(currentUser, changeStatus);

export async function changeParticipationAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const studyId = String(form.get("studyId") ?? "");
  const result = await guarded({
    studyId,
    targetUserId: String(form.get("targetUserId") ?? ""),
    next: String(form.get("next") ?? "") as Transition,
  });

  if (result.ok && studyId) revalidatePath(`/studies/${studyId}`);
  return result;
}
