import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { MeetingMode, PostSummary } from "../model/post-summary";
import { postsQuery, type PostQuery } from "./post-query";

type Row = {
  id: string;
  title: string;
  summary: string | null;
  created_at: string;
  views_count: number;
  likes_count: number;
  study: {
    id: string;
    category_id: string;
    region_code: string;
    location_detail: string | null;
    meeting_mode: string;
    max_participants: number;
    recruit_until: string | null;
    accepted_count: number;
    recruiting: boolean;
    category: { name: string };
    region: { name: string };
    slots: { weekday: number; starts_at: string }[];
  };
};

function toSummary(row: Row): PostSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    createdAt: row.created_at,
    viewsCount: row.views_count,
    likesCount: row.likes_count,
    study: {
      id: row.study.id,
      categoryId: row.study.category_id,
      categoryName: row.study.category.name,
      regionCode: row.study.region_code,
      regionName: row.study.region.name,
      locationDetail: row.study.location_detail,
      meetingMode: row.study.meeting_mode as MeetingMode,
      capacity: row.study.max_participants,
      filled: row.study.accepted_count,
      recruiting: row.study.recruiting,
      recruitUntil: row.study.recruit_until,
      slots: row.study.slots.map((s) => ({ weekday: s.weekday, startsAt: s.starts_at })),
    },
  };
}

// 정렬 어휘는 post-order.ts, 질의는 post-query.ts 가 원본이다. 여기서는 다시 내보내기만 한다 —
// 배럴(entities/post/index.ts)이 내보내는 것과 겹치는 만큼만 둔다.
export { SORTS, SORT_LABEL, toSort, type Sort } from "./post-order";
export { type PostQuery } from "./post-query";

export type PostPage = {
  readonly posts: readonly PostSummary[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
};

/**
 * 모집글 목록. **스터디마다 가장 최근 한 장만** 나온다 (docs/IA.md).
 *
 * 그 판정은 데이터베이스가 한다 — 여기서 걸러 내면 쪽을 나눈 순간 규칙이 깨진다.
 */
export async function readPosts(query: PostQuery = {}): Promise<PostPage> {
  const page = Math.max(1, query.page ?? 1);
  const perPage = query.perPage ?? 9;
  const sort = query.sort ?? "latest";

  const supabase = await createServerSupabase();
  // 질의는 `post-query.ts` 가 만든다 — 통합 검사가 **같은 함수**를 불러 눌러 본다.
  // 정렬만 상수로 공유하면, 이 파일이 그 상수를 안 쓰게 되어도 검사는 초록불이다.
  const q = postsQuery(supabase, { ...query, sort });
  const from = (page - 1) * perPage;
  const { data, error, count } = await q.range(from, from + perPage - 1);

  if (error) throw new Error(`모집글을 읽지 못했다: ${error.message}`);

  const total = count ?? 0;
  return {
    posts: ((data ?? []) as unknown as Row[]).map(toSummary),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * 홈의 「이번 주 새로 열린 스터디」. 최신순으로 스터디마다 한 장씩.
 *
 * 실패를 삼키지 않는다 — 모집글이 하나도 안 보이는 것은 빈 결과가 아니라 고장이다.
 */
export async function readLatestPosts(limit = 3): Promise<readonly PostSummary[]> {
  const { posts } = await readPosts({ perPage: limit, sort: "latest" });
  return posts;
}
