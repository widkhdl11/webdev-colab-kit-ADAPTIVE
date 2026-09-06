import { createServerSupabase } from "@/shared/api/supabase/server-client";

/** 모집글을 붙일 수 있는 스터디 하나 — 고르는 데 필요한 만큼만 읽는다 */
export type HostedStudy = {
  readonly id: string;
  readonly title: string;
};

type Row = { id: string; title: string; recruiting: boolean };

/**
 * 내가 호스트인 스터디. 모집글 작성 화면이 「어느 스터디의 모집글인가」를 고르게 하는 데 쓴다.
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
export async function readMyHostedStudies(userId: string): Promise<readonly HostedStudy[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("studies")
    .select("id, title, recruiting")
    .eq("host_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // 원인은 로그로만. PostgREST 원문에는 정책 이름·테이블 이름·보낸 값이 섞이고, 이 레포는
  // 그것을 화면 경로에 넣지 않기로 정했다(`shared/lib/db-error.ts`). 액션 경로는 그 규칙을
  // 지키는데 페이지 경로만 밖에 있었다.
  if (error) {
    console.error(`[db] 내가 만든 스터디 조회 실패 code=${error.code ?? "?"} message=${error.message}`);
    throw new Error("내가 만든 스터디를 읽지 못했다");
  }
  // 거르는 것은 여기서 한다 — `recruiting` 은 계산 컬럼(함수)이라 PostgREST 의 필터로는
  // 못 건다. 내 스터디만 읽은 뒤라 목록이 작다.
  return ((data ?? []) as Row[])
    .filter((r) => r.recruiting)
    .map((r) => ({ id: r.id, title: r.title }));
}
