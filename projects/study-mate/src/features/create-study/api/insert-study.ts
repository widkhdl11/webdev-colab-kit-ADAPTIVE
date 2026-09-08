// 스터디 개설의 본체와 조립. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
// docs/specs/write-authorization.md (INV-Z4 · Z8 · Z15) · participation-capacity.md (INV-P3)
//
// "use server" 파일과 나눠 둔 이유는 features/create-post/api/insert-post.ts 와 같다.

import { currentUser, requireSession } from "@/entities/session";
import { readSlots } from "@/entities/study/model/slots";
import { readStudyFields } from "@/entities/study/model/study-form";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ReadDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";

const DEFAULT_DEPS: ReadDeps = { createSupabase: createServerSupabase };

/**
 * 만들어진 스터디. **일정 저장이 실패해도 스터디는 만들어졌으므로 id 를 버리지 않는다** —
 * 버리면 화면이 개설 폼에 남고, 사용자의 가장 자연스러운 다음 행동(다시 제출)이
 * 같은 스터디를 하나 더 만든다(스터디에는 유일 제약이 없다). 2026-09-06 code-reviewer.
 */
export type CreatedStudy = { readonly id: string; readonly slotError: string | null };

export async function insertStudy(
  user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<CreatedStudy>> {
  // 칸의 규칙은 엔티티가 갖는다 — 수정 액션이 부르는 것과 같은 함수다.
  const read = readStudyFields(form);
  if (!read.ok) return { ok: false, message: read.message };

  // **일정을 데이터베이스에 가기 전에 본다.** 스터디를 먼저 만들고 나면 일정 실패를
  // 되돌릴 수 없고, 그때 나오는 것은 PostgreSQL 이 지은 영어 제약 위반 문장이다.
  const slots = readSlots(form);
  if (!slots.ok) return { ok: false, message: slots.message };

  const supabase = await createSupabase();

  // host_id 는 폼에서 오지 않는다 — 가드가 넘겨준 검증된 세션의 값이다 (INV-Z4).
  // 접근 정책도 host_id = auth.uid() 를 요구하므로 여기서 틀리면 데이터베이스가 거부한다.
  const { data, error } = await supabase
    .from("studies")
    .insert({ host_id: user.id, ...read.fields })
    .select("id")
    .single();

  // **원문을 화면에 안 보낸다.** 전에는 error.message 를 문구에 붙이고 있어서
  // 제약 이름·테이블 이름·정책 유무가 폼 하나로 새 나갔다 (2026-09-06 security-reviewer).
  if (error) return { ok: false, message: dbErrorMessage("스터디 개설", error) };
  if (!data) {
    console.error("[db] 스터디 개설: 오류 없이 행이 안 돌아왔다");
    return { ok: false, message: "스터디를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요" };
  }
  const id = (data as { id: string }).id;

  if (slots.slots.length > 0) {
    const { error: slotError } = await supabase
      .from("study_sessions")
      .insert(slots.slots.map((s) => ({ ...s, study_id: id })));

    // 스터디는 이미 만들어졌다. 없던 일로 되돌릴 수는 없으므로(되돌리기도 쓰기라서 또
    // 실패할 수 있다) **성공으로 돌려주되 무엇이 빠졌는지를 같이 들려 보낸다.**
    if (slotError) {
      return { ok: true, value: { id, slotError: dbErrorMessage("모임 일정을 저장", slotError) } };
    }
  }

  return { ok: true, value: { id, slotError: null } };
}

/** 세션 확인 뒤로 본체를 감춘 것. 액션 파일이 이것을 그대로 쓴다 */
export function makeCreateStudy(
  readUser: typeof currentUser = currentUser,
  deps: ReadDeps = DEFAULT_DEPS,
): (form: FormData) => Promise<ActionResult<CreatedStudy>> {
  return requireSession(readUser, (user, form: FormData) =>
    insertStudy(user, form, deps.createSupabase),
  );
}
