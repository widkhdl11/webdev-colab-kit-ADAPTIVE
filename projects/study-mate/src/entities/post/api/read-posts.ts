import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { MeetingMode, PostSummary } from "../model/post-summary";

/**
 * 카드가 필요로 하는 것만 고른다.
 *
 * `accepted_count` · `recruiting` · `likes_count` 는 컬럼이 아니라 **데이터베이스가 계산해
 * 주는 값**이다(0002 마이그레이션). 저장하지 않는 이유는 INV-P2·P6 이고, 여기서 세지 않는
 * 이유는 참여자 행이 공개가 아니기 때문이다 — 그래서 수만 내주는 함수를 거친다(INV-P9).
 */
const CARD_COLUMNS = `
  id, title, summary, created_at, views_count, likes_count,
  study:studies!inner(
    id, category_id, region_code, location_detail, meeting_mode,
    max_participants, accepted_count, recruiting,
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
      slots: row.study.slots.map((s) => ({ weekday: s.weekday, startsAt: s.starts_at })),
    },
  };
}

/**
 * 스터디마다 가장 최근 모집글 한 장만 남긴다 (docs/IA.md 「목록은 하나만 보여준다」).
 *
 * 데이터베이스가 아니라 여기서 거르는 이유: 정렬이 이미 최신순이라 **먼저 만난 것이
 * 그 스터디의 최신 글**이고, 걸러 낼 양이 페이지 하나만큼이라 옮길 값어치가 없다.
 * 목록이 커지면 이 자리가 먼저 아프므로, 그때 데이터베이스 쪽 뷰로 옮긴다.
 */
function newestPerStudy(rows: readonly Row[], limit: number): Row[] {
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of rows) {
    if (seen.has(row.study.id)) continue;
    seen.add(row.study.id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * 홈의 「이번 주 새로 열린 스터디」. 최신순으로 스터디마다 한 장씩.
 *
 * 실패를 삼키지 않는다 — 모집글이 하나도 안 보이는 것은 빈 결과가 아니라 고장이다.
 */
export async function readLatestPosts(limit = 3): Promise<readonly PostSummary[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("posts")
    .select(CARD_COLUMNS)
    .order("created_at", { ascending: false })
    // 스터디마다 하나만 남길 것이므로 넉넉히 받아 온다. 한 스터디가 여러 번 모집한
    // 경우가 겹쳐도 요청한 수를 채우기 위해서다.
    .limit(limit * 4);

  if (error) throw new Error(`모집글을 읽지 못했다: ${error.message}`);
  return newestPerStudy((data ?? []) as unknown as Row[], limit).map(toSummary);
}
