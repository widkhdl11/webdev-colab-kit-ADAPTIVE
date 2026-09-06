import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError, throwShapeError } from "@/shared/lib/db-error";

/**
 * 수정 화면이 칸에 채워 넣는 값.
 *
 * **고칠 수 있는 세 칸(제목·한 줄 소개·내용)과 못 고치는 것 하나(어느 스터디의 글인가)** 다.
 * 스터디 이름이 들어 있는 이유는 바꾸기 위해서가 아니라 **바꿀 수 없다는 것을 보여 주기
 * 위해서**다 — 작성 화면에는 스터디를 고르는 칸이 있으니, 수정 화면에서 그 칸이 그냥
 * 사라지면 사용자는 옮길 수 있는지 없는지 알 수 없다.
 */
export type EditablePost = {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly content: string;
  readonly studyId: string;
  readonly studyTitle: string;
};

type Row = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  study: { id: string; title: string };
};

/**
 * 내가 쓴 모집글 한 편을 수정 화면 모양으로. **없으면 null** 이고 오류가 아니다.
 *
 * **`author_id` 로 거르는 것이 인가는 아니다.** 인가의 주인은 갱신 정책
 * (`posts_update_author`)이고, 그것이 `author_id = auth.uid()` 를 양쪽으로 요구한다 (INV-Z3).
 * 여기서 거르는 것은 **화면이 남의 글을 채워 놓고 「저장」을 누르게 두지 않기 위해서**다 —
 * 이 필터가 없어도 저장은 정책이 거부하지만, 그때 사용자는 남의 글을 고칠 수 있다고 믿고
 * 다 적은 뒤에야 막힌다.
 *
 * **지워진 스터디의 모집글은 안 준다.** `study_is_visible` 은 호스트에게 자기가 지운
 * 스터디도 보여 주므로 `!inner` 만으로는 안 걸린다. 「내가 쓴 모집글」 목록이 그 글을 이미
 * 빼고 있으므로(`read-my-posts.ts`), 여기서만 열어 두면 목록에 없는 글의 수정 화면이 열린다.
 */
export async function readPostForEdit(
  postId: string,
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<EditablePost | null> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, summary, content, study:studies!inner(id, title)")
    .eq("id", postId)
    .eq("author_id", userId)
    .is("study.deleted_at", null)
    .maybeSingle();

  if (error) throwDbError("수정할 모집글", error);
  if (!data) return null;

  const row = data as unknown as Row;
  // 임베드가 못 만들어졌으면 PostgREST 는 오류 없이 키를 빼고 돌려준다. 확인하지 않으면
  // `undefined` 가 `string` 자리를 통과해 스터디 이름 없는 화면이 그려진다.
  const ok =
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    (row.summary === null || typeof row.summary === "string") &&
    typeof row.content === "string" &&
    typeof row.study?.id === "string" &&
    typeof row.study?.title === "string";
  if (!ok) throwShapeError("수정할 모집글", `모집글 ${postId}`, row);

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    studyId: row.study.id,
    studyTitle: row.study.title,
  };
}
