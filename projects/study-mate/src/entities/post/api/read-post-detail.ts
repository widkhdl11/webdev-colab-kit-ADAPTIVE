import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError } from "@/shared/lib/db-error";
import type { MeetingMode } from "../model/post-summary";
import type { PostDetail } from "../model/post-detail";

const DETAIL_COLUMNS = `
  id, title, summary, content, created_at, views_count, likes_count, author_id,
  author:profiles!posts_author_id_fkey(id, username, bio, region, interest_category),
  study:studies!inner(
    id, host_id, title, summary, description, deleted_at,
    category_id, region_code, location_detail, meeting_mode,
    max_participants, starts_on, ends_on, recruit_until,
    accepted_count, recruiting,
    category:categories!inner(name),
    region:regions!inner(name),
    slots:study_sessions(weekday, starts_at, ends_at),
    host:profiles!studies_host_id_fkey(id, username, bio, region, interest_category)
  )
`;

type ProfileRow = {
  id: string;
  username: string;
  bio: string | null;
  region: string | null;
  interest_category: string | null;
};

type Row = {
  id: string;
  title: string;
  summary: string | null;
  content: string;
  created_at: string;
  views_count: number;
  likes_count: number;
  author_id: string;
  author: ProfileRow | null;
  study: {
    id: string;
    host_id: string;
    deleted_at: string | null;
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
    recruiting: boolean;
    category: { name: string };
    region: { name: string };
    slots: { weekday: number; starts_at: string; ends_at: string }[];
    host: ProfileRow | null;
  };
};

const toPerson = (row: ProfileRow | null) =>
  row === null
    ? null
    : { id: row.id, username: row.username, bio: row.bio, regionCode: row.region };

/**
 * 상세 화면 한 장. **없으면 null** 이고 오류가 아니다 — 지워진 스터디의 모집글은
 * 조회 정책이 감추므로(INV-Z10) "없다"와 "안 보인다"가 화면에서 같아야 한다.
 */
export async function readPostDetail(
  postId: string,
  userId: string | null,
): Promise<PostDetail | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("posts")
    .select(DETAIL_COLUMNS)
    .eq("id", postId)
    .maybeSingle();

  // **원문을 문구에 담지 않는다.** 이 한 줄만 `db-error.ts` 의 계약 밖에 있었다 —
  // uuid 가 아닌 주소로 들어오면 Postgres 가 `invalid input syntax for type uuid: "<보낸 값>"`
  // 을 돌려주고 그 문장이 그대로 실려 나갔다(2026-09-06 security-reviewer).
  if (error) throwDbError("모집글 상세", error);
  if (!data) return null;

  const row = data as unknown as Row;
  const s = row.study;

  // 지금 이 사람이 이 스터디와 어떤 사이인지.
  //
  // **반드시 사용자로 걸러야 한다.** "정책이 내 행만 보여준다"에 기대면 안 된다 —
  // 0004 가 「수락된 멤버는 같은 스터디의 수락된 행을 본다」로 넓히면서 그 가정이 깨졌고,
  // 그 순간 이 질의가 여러 줄을 받아 `maybeSingle()` 이 오류를 내며 null 이 됐다.
  // 결과는 조용했다 — **이미 참여 중인 멤버에게 "참가 신청" 버튼이 보였다.**
  const mine = userId
    ? await supabase
        .from("participants")
        .select("status")
        .eq("study_id", s.id)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  // 좋아요도 같다 — 이 글의 좋아요는 누구나 보이므로 내 것만 집어야 한다.
  const liked = userId
    ? await supabase
        .from("likes")
        .select("id")
        .eq("post_id", postId)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    createdAt: row.created_at,
    viewsCount: row.views_count,
    likesCount: row.likes_count,
    author: toPerson(row.author),
    authorId: row.author_id,
    likedByMe: liked.data !== null,
    myParticipation: (mine.data?.status as PostDetail["myParticipation"]) ?? null,
    study: {
      id: s.id,
      title: s.title,
      description: s.description,
      categoryId: s.category_id,
      categoryName: s.category.name,
      regionCode: s.region_code,
      regionName: s.region.name,
      locationDetail: s.location_detail,
      meetingMode: s.meeting_mode as MeetingMode,
      capacity: s.max_participants,
      filled: s.accepted_count,
      recruiting: s.recruiting,
      recruitUntil: s.recruit_until,
      startsOn: s.starts_on,
      endsOn: s.ends_on,
      slots: s.slots.map((x) => ({
        weekday: x.weekday,
        startsAt: x.starts_at,
        endsAt: x.ends_at,
      })),
      host: toPerson(s.host),
      hostId: s.host_id,
      deleted: s.deleted_at !== null,
    },
  };
}

/**
 * 조회수를 올린다. 정책이 작성자로 묶여 있어 남이 읽으면 안 올라가던 자리라,
 * 데이터베이스 쪽 함수가 한 문장으로 올린다(0002).
 *
 * 실패해도 화면은 그대로 보여준다 — 조회수가 하나 덜 세어지는 것보다
 * 글이 안 보이는 쪽이 나쁘다.
 */
export async function countPostView(postId: string): Promise<void> {
  try {
    const supabase = await createServerSupabase();
    await supabase.rpc("increment_post_views", { p_post_id: postId });
  } catch {
    // 무시한다 — 위 주석의 이유.
  }
}
