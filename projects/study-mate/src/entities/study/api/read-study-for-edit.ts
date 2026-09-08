import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError, throwShapeError } from "@/shared/lib/db-error";
import { hhmm } from "../model/slots";
import type { MeetingMode } from "../model/study";

/**
 * 수정 화면이 칸에 채워 넣는 값. **개설 폼이 보내는 것과 같은 열한 칸 + 모임 일정**이고,
 * 여기에 없는 것이 못 고치는 것이다 — 호스트(INV-Z15) · 모집 마감 여부 · 삭제 표시.
 *
 * `filled` 는 고치라고 주는 값이 아니라 **정원 칸의 하한을 화면이 말할 수 있게** 하는 값이다.
 * 지금 수락된 인원보다 정원을 낮추는 갱신은 데이터베이스가 거부하는데(INV-P3), 그것을
 * 저장 버튼을 누른 뒤에 알게 되면 사용자는 왜 막혔는지 모른다.
 */
export type EditableStudy = {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string;
  readonly categoryId: string;
  readonly regionCode: string;
  readonly locationDetail: string | null;
  readonly meetingMode: MeetingMode;
  readonly capacity: number;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly recruitUntil: string | null;
  readonly filled: number;
  readonly slots: readonly { readonly weekday: number; readonly startsAt: string; readonly endsAt: string }[];
};

type Row = {
  id: string;
  title: string;
  summary: string | null;
  description: string;
  category_id: string;
  region_code: string;
  location_detail: string | null;
  meeting_mode: string;
  max_participants: number;
  starts_on: string | null;
  ends_on: string | null;
  recruit_until: string | null;
  accepted_count: number;
  slots: { weekday: number; starts_at: string; ends_at: string }[];
};

/**
 * 내가 여는 스터디 하나를 수정 화면 모양으로. **없으면 null** 이고 오류가 아니다.
 *
 * **`host_id` 로 거르는 것이 인가는 아니다.** 인가의 주인은 갱신 정책(`studies_update_host`)
 * 이고, 그것이 호스트를 양쪽으로 요구한다 (INV-Z15). 여기서 거르는 것은 **화면이 남의
 * 스터디를 채워 놓고 「저장」을 누르게 두지 않기 위해서**다 — 이 필터가 없어도 저장은 정책이
 * 거부하지만, 그때 사용자는 고칠 수 있다고 믿고 다 적은 뒤에야 막힌다.
 *
 * **지워진 스터디도 안 준다** (INV-Z16). 조회 정책은 호스트에게 자기가 지운 스터디를 계속
 * 보여 주므로 이 조건이 없으면 화면이 열리고, 갱신 정책이 그 저장을 전부 거부한다.
 */
export async function readStudyForEdit(
  studyId: string,
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<EditableStudy | null> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("studies")
    .select(
      `id, title, summary, description, category_id, region_code, location_detail,
       meeting_mode, max_participants, starts_on, ends_on, recruit_until, accepted_count,
       slots:study_sessions(weekday, starts_at, ends_at)`,
    )
    .eq("id", studyId)
    .eq("host_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throwDbError("수정할 스터디", error);
  if (!data) return null;

  const row = data as unknown as Row;
  // 계산 컬럼이나 임베드가 못 만들어지면 PostgREST 는 오류 없이 키를 빼고 돌려준다.
  // 확인하지 않으면 `undefined` 가 숫자 자리를 통과해 정원 칸이 빈 폼이 그려진다.
  const ok =
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.description === "string" &&
    typeof row.category_id === "string" &&
    typeof row.region_code === "string" &&
    typeof row.meeting_mode === "string" &&
    typeof row.max_participants === "number" &&
    typeof row.accepted_count === "number" &&
    Array.isArray(row.slots) &&
    // **원소 안까지 본다.** 배열인 것만 보고 넘기면 아래에서 `hhmm(undefined)` 이
    // `Cannot read properties of undefined` 로 터진다 — 정돈된 문구 대신 그 예외가
    // 오류 경계로 가고, 무엇이 모자랐는지는 아무 데도 안 남는다.
    row.slots.every(
      (s) =>
        typeof s?.weekday === "number" &&
        typeof s?.starts_at === "string" &&
        typeof s?.ends_at === "string",
    );
  if (!ok) throwShapeError("수정할 스터디", `스터디 ${studyId}`, row);

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    description: row.description,
    categoryId: row.category_id,
    regionCode: row.region_code,
    locationDetail: row.location_detail,
    meetingMode: row.meeting_mode as MeetingMode,
    capacity: row.max_participants,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    recruitUntil: row.recruit_until,
    filled: row.accepted_count,
    // 요일·시각 순으로 세운다. 데이터베이스는 순서를 약속하지 않으므로, 안 세우면 저장할
    // 때마다 폼의 줄 순서가 뒤바뀌어 사용자가 「내가 안 건드린 줄이 움직였다」로 읽는다.
    slots: [...row.slots]
      .sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at))
      .map((s) => ({ weekday: s.weekday, startsAt: hhmm(s.starts_at), endsAt: hhmm(s.ends_at) })),
  };
}
