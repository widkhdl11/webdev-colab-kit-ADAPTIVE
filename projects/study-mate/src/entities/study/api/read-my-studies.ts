// 내가 호스트인 스터디를 읽는 두 함수가 한 파일에 있다. **이름이 규칙을 말한다** —
// 「내가 호스트인가」는 둘이 같고 갈리는 것은 거르는 기준이라, 이름이 소유를 말하면
// (`readMyHostedStudies` / `readStudiesIHost` 처럼) 부르는 쪽이 고를 근거가 없어진다.
// 2026-09-06 에 code-reviewer 가 그 상태를 잡았다.

import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError, throwShapeError } from "@/shared/lib/db-error";
import type { MyStudy } from "../model/my-study";

/** 모집글을 붙일 수 있는 스터디 하나 — 고르는 데 필요한 만큼만 읽는다 */
export type PostableStudy = {
  readonly id: string;
  readonly title: string;
};

type PostableRow = { id: string; title: string; recruiting: boolean };

/**
 * **모집글을 붙일 수 있는** 내 스터디. 모집글 작성 화면이 「어느 스터디의 모집글인가」를
 * 고르게 하는 데 쓴다.
 *
 * **이 목록은 인가가 아니다.** 모집글을 만들 수 있는 사람은 접근 정책이 정한다
 * (INV-Z9: `author_id = auth.uid() and private.is_study_host(study_id, auth.uid())`).
 * 여기서 거르는 것은 고를 수 있는 것만 보여 주기 위해서고, 이 목록을 통째로 무시하고
 * 남의 스터디 id 를 폼에 넣어도 쓰기는 데이터베이스가 거부한다.
 *
 * **모집 중이 아닌 스터디는 뺀다** — 고르게 두면 고른 뒤에 정책이 거부한다
 * (INV-Z14, 강제 위치는 `posts_insert_author` 의 `private.study_is_recruiting`, 0014).
 * 거르는 기준을 여기서 다시 적지 않고 **화면이 「모집중」 배지를 그릴 때 쓰는 계산 컬럼**
 * (`recruiting`)을 그대로 읽는다 — 조건을 옮겨 적으면 두 벌이 되어, 화면에는 「마감」인데
 * 목록에는 뜨는 상태가 조용히 만들어진다.
 *
 * **2026-09-06 이전에는 이 주석이 거짓이었다** — 정책에 그 조건이 없어서 거부가 안 났고,
 * 이 목록이 INV-Z10 을 지키는 유일한 자리였다. 리뷰어 셋이 독립적으로 잡았다.
 */
export async function readPostableStudies(
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<readonly PostableStudy[]> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("studies")
    .select("id, title, recruiting")
    .eq("host_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throwDbError("모집글을 붙일 수 있는 스터디", error);

  // 거르는 것은 여기서 한다 — `recruiting` 은 계산 컬럼(함수)이라 PostgREST 의 필터로는
  // 못 건다. 내 스터디만 읽은 뒤라 목록이 작다.
  return ((data ?? []) as PostableRow[])
    .filter((r) => r.recruiting)
    .map((r) => ({ id: r.id, title: r.title }));
}

type MyStudyRow = {
  id: string;
  title: string;
  category_id: string;
  max_participants: number;
  accepted_count: number;
  recruiting: boolean;
  category: { name: string };
};

/**
 * 응답을 화면이 쓰는 모양으로. **모양이 어긋나면 던진다.**
 *
 * `accepted_count` 와 `recruiting` 은 컬럼이 아니라 계산 함수다(0002). 이름이 바뀌거나
 * 없어졌을 때 최상위 select 는 PostgREST 가 오류를 내지만 임베드(`category`)는 **그 키만
 * 빼고** 돌려준다. 확인 없이 두면 `recruiting: undefined` 가 `boolean` 자리를 통과해
 * **모든 내 스터디에 「마감」 배지**가 붙고, `categoryName: undefined` 가 글자 없는 색
 * 알약을 그린다 — 오류가 아니라 정상 화면으로 보인다(`read-chats.ts` 가 같은 판단을 적어 뒀다).
 */
function toMyStudy(row: MyStudyRow): MyStudy {
  const ok =
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.category_id === "string" &&
    typeof row.max_participants === "number" &&
    typeof row.accepted_count === "number" &&
    typeof row.recruiting === "boolean" &&
    typeof row.category?.name === "string";
  if (!ok) throwShapeError("내가 만든 스터디", `스터디 ${row.id}`, row);

  return {
    id: row.id,
    title: row.title,
    categoryId: row.category_id,
    categoryName: row.category.name,
    capacity: row.max_participants,
    filled: row.accepted_count,
    recruiting: row.recruiting,
  };
}

/**
 * 내가 호스트인 스터디 **전부**. 위의 `readPostableStudies` 와 **거르는 기준이 다르다** —
 * 저쪽은 모집글을 붙일 수 있는 것만 보여 주려고 모집 중인 것으로 좁히고, 이쪽은 내가 만든
 * 것을 다 보여 주는 자리라 마감한 스터디도 그대로 나온다. 한 함수에 옵션을 붙이지 않은
 * 이유는 그 옵션의 기본값이 무엇이어야 하는지가 자리마다 다르기 때문이다.
 *
 * **지워진 것은 뺀다.** 호스트는 자기가 지운 스터디도 읽을 수 있지만(`studies_read`),
 * 「내가 만든 스터디」에 지운 것이 남아 있으면 지운 것이 아니게 된다. 같은 판단을
 * `entities/post` 의 「내가 쓴 모집글」도 따른다 — 한 화면 안에서 갈리면 안 되기 때문이다.
 */
export async function readMyStudies(
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<readonly MyStudy[]> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("studies")
    .select(
      "id, title, category_id, max_participants, accepted_count, recruiting, category:categories!inner(name)",
    )
    .eq("host_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throwDbError("내가 만든 스터디", error);

  return ((data ?? []) as unknown as MyStudyRow[]).map(toMyStudy);
}
