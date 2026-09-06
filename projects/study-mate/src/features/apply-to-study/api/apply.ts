"use server";

// 참가 신청. 근거 스펙: docs/specs/participation-capacity.md (INV-P4·P7) ·
// docs/specs/auth-session.md (INV-A4) · docs/specs/write-authorization.md (INV-Z4·Z8)

import { dbErrorMessage } from "@/shared/lib/db-error";
import { revalidateEntityPath } from "@/shared/lib/revalidate-entity";
import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";

/**
 * 신청 행을 만든다.
 *
 * **사용자 아이디를 인자로 받지 않는다** — 가드가 넘겨주는 검증된 세션의 값만 쓴다(INV-Z4).
 * 그리고 여기서 정하는 것은 없다: 자리가 있는지·지워진 스터디인지·이미 신청했는지는
 * 전부 데이터베이스가 판정한다(접근 정책 + 유일 제약 + 트리거). 서버 판정은 화면에
 * 이유를 보여주기 위한 것이지 계약이 아니다 — 공개 키로 접근하는 구조에서 서버 판정은
 * 우회 가능하기 때문이다.
 */
async function insertApplication(
  user: { readonly id: string },
  studyId: string,
): Promise<ActionResult<null>> {
  if (!studyId) return { ok: false, message: "어느 스터디인지 알 수 없습니다" };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from("participants")
    .insert({ study_id: studyId, user_id: user.id, status: "pending" });

  if (error) {
    // 데이터베이스가 거부한 이유를 사람의 말로 옮긴다. 거부 자체는 위에서 이미 일어났다.
    if (error.code === "23505") return { ok: false, message: "이미 신청한 스터디입니다" };
    if (error.code === "42501")
      return { ok: false, message: "지금은 신청할 수 없는 스터디입니다" };
    return { ok: false, message: dbErrorMessage("신청", error) };
  }

  return { ok: true, value: null };
}

/** 세션 확인 뒤로 본체를 감춘다 — 액션 안에서 "세션 확인을 깜빡하는 것"이 일어날 수 없다 */
const guarded = requireSession(currentUser, insertApplication);

/**
 * 화면이 부르는 자리. 폼에서 오므로 FormData 를 받고, 끝나면 그 모집글 화면을 다시 그린다.
 * 앞의 결과를 첫 인자로 받는 것은 React 의 폼 상태 규약이다(화면이 실패 문구를 그려야 한다).
 *
 * 실패해도 예외를 던지지 않는다 — 던지면 화면이 통째로 오류 페이지가 되어
 * "왜 안 됐는지"를 사용자가 못 읽는다.
 */
export async function applyToStudyAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const studyId = String(form.get("studyId") ?? "");
  const postId = String(form.get("postId") ?? "");

  const result = await guarded(studyId);
  if (result.ok) revalidateEntityPath("/posts", postId);
  return result;
}
