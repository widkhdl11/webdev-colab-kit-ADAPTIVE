import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { MeetingMode, PostSummary } from "../model/post-summary";

/**
 * 카드가 필요로 하는 것만 고른다.
 *
 * `accepted_count` · `recruiting` · `likes_count` · `is_latest_for_study` 는 컬럼이 아니라
 * **데이터베이스가 계산해 주는 값**이다(0002 · 0003 마이그레이션). 저장하지 않는 이유는
 * INV-P2·P6 이고, 여기서 세지 않는 이유는 참여자 행이 공개가 아니기 때문이다 —
 * 그래서 수만 내주는 함수를 거친다(INV-P9).
 */
const CARD_COLUMNS = `
  id, title, summary, created_at, views_count, likes_count,
  study:studies!inner(
    id, category_id, region_code, location_detail, meeting_mode,
    max_participants, recruit_until, accepted_count, recruiting,
    category:categories!inner(name),
    region:regions!inner(name),
    slots:study_sessions(weekday, starts_at)
  )
`;

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

/** 목록 정렬 셋. 「마감 임박순」의 기준은 모집 마감일이다 (docs/IA.md) */
export const SORTS = ["latest", "deadline", "likes"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABEL: Readonly<Record<Sort, string>> = {
  latest: "최신순",
  deadline: "마감 임박순",
  likes: "좋아요순",
};

export function toSort(value: string | undefined): Sort {
  return SORTS.includes(value as Sort) ? (value as Sort) : "latest";
}

export type PostQuery = {
  /** 제목·요약 부분 일치 */
  readonly q?: string;
  /** 대분류 아이디. 비어 있으면 전체 */
  readonly categories?: readonly string[];
  readonly regionCode?: string;
  /** true 면 온라인 진행만 */
  readonly onlineOnly?: boolean;
  readonly openOnly?: boolean;
  readonly sort?: Sort;
  /** 1부터 */
  readonly page?: number;
  readonly perPage?: number;
};

export type PostPage = {
  readonly posts: readonly PostSummary[];
  readonly total: number;
  readonly page: number;
  readonly perPage: number;
  readonly pageCount: number;
};

/** PostgREST 의 패턴 문법에서 뜻을 갖는 글자를 없앤다 — 검색어가 필터를 깨지 않게 */
function safePattern(q: string): string {
  return q.replace(/[%_,()]/g, " ").trim();
}

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
  let q = supabase
    .from("posts")
    .select(CARD_COLUMNS, { count: "exact" })
    .eq("is_latest_for_study", true);

  if (query.q) {
    const pattern = safePattern(query.q);
    if (pattern) q = q.or(`title.ilike.%${pattern}%,summary.ilike.%${pattern}%`);
  }
  if (query.categories && query.categories.length > 0) {
    q = q.in("study.category_id", [...query.categories]);
  }
  if (query.regionCode) q = q.eq("study.region_code", query.regionCode);
  if (query.onlineOnly) q = q.in("study.meeting_mode", ["online", "hybrid"]);
  if (query.openOnly) q = q.eq("study.recruiting", true);

  if (sort === "latest") q = q.order("created_at", { ascending: false });
  else if (sort === "likes") q = q.order("likes_count", { ascending: false });
  else {
    // 마감일이 없는 스터디는 "기한 없음"이라 임박 목록의 끝으로 보낸다.
    q = q.order("recruit_until", {
      referencedTable: "study",
      ascending: true,
      nullsFirst: false,
    });
  }
  q = q.order("id", { ascending: true }); // 같은 값일 때 순서를 고정한다

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
