// 스터디 수정의 본체와 조립. 근거 스펙: docs/specs/auth-session.md (INV-A4) ·
// docs/specs/write-authorization.md (INV-Z4 · Z15 · Z16) · participation-capacity.md (INV-P3)
//
// **"use server" 파일과 나눠 둔 이유**는 `features/edit-post` 와 같다 — 액션 파일의
// 내보내기는 전부 클라이언트가 부를 수 있는 자리라, 판독기·클라이언트를 인자로 여는 조립을
// 거기 두면 그 인자가 요청으로 들어올 수 있는 값이 된다.

import { currentUser, requireSession } from "@/entities/session";
import { diffSlots, readSlots, type Slot } from "@/entities/study/model/slots";
import { readStudyFields } from "@/entities/study/model/study-form";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { defaultPathDeps, type PathDeps } from "@/shared/lib/action-deps";
import type { ActionResult } from "@/shared/lib/action-result";
import { dbErrorMessage } from "@/shared/lib/db-error";
import { canonicalUuid } from "@/shared/lib/uuid";

/**
 * 고친 스터디. `slotError` 가 null 이 아니면 **본문은 저장됐고 일정만 못 바꾼 것**이다.
 *
 * **`slotsWiped` 로 두 갈래를 가른다.** 지우기까지 끝난 뒤 넣기가 실패하면 바꾸려던 줄이
 * 데이터베이스에서 사라진 상태다 — 그때 「일정은 안 바뀌었다」고 말하면 거짓이고, 사용자가
 * 해야 할 일도 다르다(그냥 기다리는 것이 아니라 저장을 한 번 더 눌러 되돌려야 한다).
 */
export type UpdatedStudy = {
  readonly id: string;
  readonly slotError: string | null;
  readonly slotsWiped: boolean;
};

/** 일정 동기화의 결과. 어느 단계에서 멈췄는지가 화면 문구를 가른다 */
type SlotSync = { readonly error: string | null; readonly wiped: boolean };

type SlotRow = Slot & { id: string };

/**
 * 내가 여는 스터디 하나의 열한 칸과 모임 일정을 고친다.
 *
 * **고칠 대상을 「그 스터디」이자 「내가 여는 스터디」로 좁힌다** (INV-Z15). 갱신 정책
 * (`studies_update_host`)이 호스트를 양쪽으로 요구하므로 이 줄이 빠져도 남의 스터디는
 * 안 바뀐다 — **인가의 주인은 정책이고, 이 줄은 앱 경로에 한 겹 더 두는 것**이다.
 * 정책의 `using` 에 걸린 행은 오류가 아니라 갱신 0행으로 떨어지므로, 아래 「0행」 갈래가
 * 「없는 스터디 · 남의 스터디 · 지워진 스터디」 셋을 같이 받는다.
 *
 * **호스트는 갱신에 안 싣는다** (INV-Z15). 데이터베이스의 갱신 권한 목록에 `host_id` 가
 * 없어서 실으면 요청이 통째로 거부된다. 스터디를 남에게 넘길 수 없다는 것이 계약이고,
 * 그래서 폼에도 그 칸이 없다.
 */
export async function updateStudy(
  user: { readonly id: string },
  form: FormData,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<ActionResult<UpdatedStudy>> {
  const studyId = canonicalUuid(form.get("studyId"));
  if (!studyId) return { ok: false, message: "어느 스터디를 고치는지 알 수 없습니다" };

  // 칸의 규칙은 엔티티가 갖는다 — 개설 액션이 부르는 것과 같은 함수다.
  const read = readStudyFields(form);
  if (!read.ok) return { ok: false, message: read.message };

  // **일정을 데이터베이스에 가기 전에 본다.** 본문 갱신이 먼저 나가므로, 일정 줄이 규칙을
  // 어겼다는 것을 나중에 알면 본문만 저장된 채로 오류를 보여 주게 된다.
  const slots = readSlots(form);
  if (!slots.ok) return { ok: false, message: slots.message };

  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("studies")
    .update(read.fields)
    .eq("id", studyId)
    .eq("host_id", user.id)
    .select("id")
    .maybeSingle();

  // **원문을 화면에 안 보낸다** — 제약 이름·테이블 이름·정책 유무가 폼 하나로 새 나간다.
  // 정원을 지금 인원보다 낮춘 경우가 여기로 온다 (INV-P3).
  if (error) return { ok: false, message: dbErrorMessage("스터디를 수정", error) };
  // **0행은 오류가 아니다.** 없는 스터디거나 남의 것이거나 이미 지워진 것이면 갱신이
  // 아무것도 안 맞히고 조용히 끝난다. 이 갈래를 성공으로 읽으면 "저장했습니다"가 나가면서
  // 아무것도 안 바뀐다.
  if (!data) {
    return {
      ok: false,
      message: "고칠 수 있는 스터디가 아닙니다. 내가 여는 스터디인지 확인해 주세요",
    };
  }

  const sync = await syncSlots(supabase, studyId, slots.slots);
  return {
    ok: true,
    value: { id: (data as { id: string }).id, slotError: sync.error, slotsWiped: sync.wiped },
  };
}

/**
 * 모임 일정을 폼이 보낸 모양으로 맞춘다. **바뀐 줄만 건드린다** (`diffSlots`).
 *
 * 지우기와 넣기를 한 요청으로 묶을 수 없다 — PostgREST 는 요청 하나에 한 표만 쓴다.
 * 그래서 넣기가 실패하면 **지워진 줄이 안 돌아온다.** 잃을 수 있는 것을 실제로 바뀐 줄로
 * 좁히는 것이 최선이고, 그 위에 화면이 무엇이 안 됐는지 말한다(2026-09-07 사람 결정).
 *
 * 순서는 지우기가 먼저다 — 끝 시각만 바꾼 줄은 요일·시작 시각이 같아서
 * `study_sessions_unique` 에 걸린다.
 */
async function syncSlots(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  studyId: string,
  next: readonly Slot[],
): Promise<SlotSync> {
  const { data, error } = await supabase
    .from("study_sessions")
    .select("id, weekday, starts_at, ends_at")
    .eq("study_id", studyId);
  if (error) return { error: dbErrorMessage("모임 일정 읽기", error), wiped: false };

  const { toDelete, toInsert } = diffSlots((data ?? []) as SlotRow[], next);
  if (toDelete.length === 0 && toInsert.length === 0) return { error: null, wiped: false };

  if (toDelete.length > 0) {
    // **`study_id` 를 지우기에도 겹쳐 건다.** 위 조회의 필터 하나에만 기대면, 그 줄이
    // 사라지는 날 `sessions_read` 가 `using (true)` 라서 남의 일정까지 전부 읽히고
    // 그것이 그대로 지울 id 목록이 된다 — 삭제 정책은 「내가 호스트인 스터디」를 통과시키므로
    // **내가 여는 다른 스터디의 일정이 같이 지워진다.**
    const { error: delError } = await supabase
      .from("study_sessions")
      .delete()
      .eq("study_id", studyId)
      .in("id", toDelete.map((s) => s.id));
    if (delError) return { error: dbErrorMessage("모임 일정을 저장", delError), wiped: false };
  }
  if (toInsert.length > 0) {
    const { error: insError } = await supabase
      .from("study_sessions")
      .insert(toInsert.map((s) => ({ ...s, study_id: studyId })));
    // 여기까지 오면 지우기는 이미 끝났다 — 바꾸려던 줄이 지금 데이터베이스에 없다.
    if (insError) {
      return { error: dbErrorMessage("모임 일정을 저장", insError), wiped: toDelete.length > 0 };
    }
  }
  return { error: null, wiped: false };
}

/**
 * 세션 확인 뒤로 본체를 감추고, 성공하면 고친 값이 나오는 화면들을 다시 받게 한다.
 *
 * **캐시 지우기를 액션 파일이 아니라 여기 두는 이유**는 검사가 붙들 수 있게 하는 것이다 —
 * 액션 파일에 두면 그 줄을 지워도 전 스위트가 초록불이다 (2026-09-06 code-reviewer).
 */
export function makeUpdateStudy(
  readUser: typeof currentUser = currentUser,
  deps: PathDeps = defaultPathDeps,
): (form: FormData) => Promise<ActionResult<UpdatedStudy>> {
  const guarded = requireSession(readUser, (user, form: FormData) =>
    updateStudy(user, form, deps.createSupabase),
  );
  return async (form: FormData) => {
    const result = await guarded(form);
    // **고친 값이 나오는 화면 전부다.** 스터디 상세는 물론이고, 모집글 목록·상세·홈은
    // 스터디의 제목·지역·정원·좌석을 그대로 그린다(`read-posts.ts` · `read-post-detail.ts`).
    // 「내가 만든 스터디」가 제목을 그리므로 `/profile` 도 넣는다. 주간 플래너가 요일·시간을
    // 그리므로 홈은 일정만 바뀌어도 낡는다. `/chats` 는 방마다 스터디 제목을 그린다
    // (`CHAT_ROOM_SELECT` 가 `studies(title)` 을 읽는다 — 2026-09-07 code-reviewer).
    //
    // 이 화면들은 전부 `force-dynamic` 이라 서버가 응답을 캐시하지 않는다. 그래도 지우는
    // 이유는 **라우터가 들고 있는 항목**이 남기 때문이다 — 안 지우면 뒤로 가기가 고치기
    // 전 화면을 그린다(2026-09-06 에 모집글 삭제에서 실제로 났다).
    if (result.ok) {
      deps.revalidatePaths(`/studies/${result.value.id}`, "/posts", "/profile", "/", "/chats");
    }
    return result;
  };
}
