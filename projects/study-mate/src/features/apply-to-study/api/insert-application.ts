// 참가 신청의 본체와 조립. 근거 스펙: docs/specs/participation-capacity.md (INV-P4·P7) ·
// docs/specs/auth-session.md (INV-A4) · docs/specs/write-authorization.md (INV-Z4·Z8)
//
// `"use server"` 파일과 나눠 둔 이유는 `features/create-post/api/insert-post.ts` 와 같다.

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { revalidateEntityPath } from "@/shared/lib/revalidate-entity";

const DEFAULT_DEPS: ActionDeps = {
  createSupabase: createServerSupabase,
  revalidate: revalidateEntityPath,
};

/**
 * 신청 행을 만든다.
 *
 * **사용자 아이디를 인자로 받지 않는다** — 가드가 넘겨주는 검증된 세션의 값만 쓴다(INV-Z4).
 * 그리고 여기서 정하는 것은 없다: 자리가 있는지·지워진 스터디인지·이미 신청했는지는
 * 전부 데이터베이스가 판정한다(접근 정책 + 유일 제약 + 트리거). 서버 판정은 화면에
 * 이유를 보여주기 위한 것이지 계약이 아니다 — 공개 키로 접근하는 구조에서 서버 판정은
 * 우회 가능하기 때문이다.
 */
export async function insertApplication(
  user: { readonly id: string },
  studyId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<null>> {
  if (!studyId) return { ok: false, message: "어느 스터디인지 알 수 없습니다" };

  const supabase = await createSupabase();
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

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 그 모집글 화면을 다시 그리게 한다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 둔다.** 액션 파일에 두면 그 호출을 지워도
 * 전 스위트가 초록불이다 — 쓰기는 됐는데 화면만 낡은 상태가 아무 신호 없이 만들어진다
 * (2026-09-06 백로그). 여기 있으면 주입한 가짜로 「불렀는가」를 단언할 수 있다.
 */
export function makeApply(
  readUser: typeof currentUser = currentUser,
  deps: ActionDeps = DEFAULT_DEPS,
): (form: FormData) => Promise<ActionResult<null>> {
  const guarded = requireSession(readUser, (user, studyId: string) =>
    insertApplication(user, studyId, deps.createSupabase),
  );
  return async (form: FormData) => {
    const result = await guarded(String(form.get("studyId") ?? ""));
    if (result.ok) deps.revalidate("/posts", form.get("postId"));
    return result;
  };
}
