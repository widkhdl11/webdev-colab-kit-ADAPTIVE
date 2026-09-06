import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { MeetingMode, ParticipationStatus, Person } from "../model/study";

export type Member = {
  readonly participantId: string;
  readonly person: Person;
  readonly status: ParticipationStatus;
  readonly isHost: boolean;
  readonly since: string;
};

export type StudyPage = {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly description: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly regionName: string;
  readonly locationDetail: string | null;
  readonly meetingMode: MeetingMode;
  readonly capacity: number;
  readonly filled: number;
  readonly recruiting: boolean;
  readonly closedAt: string | null;
  readonly recruitUntil: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly slots: readonly { weekday: number; startsAt: string; endsAt: string }[];
  readonly hostId: string;
  /** 수락된 사람들. 호스트가 첫 줄이다 */
  readonly members: readonly Member[];
  /**
   * 대기 중인 신청. **호스트에게만 채워진다** — 멤버에게는 빈 목록이다(INV-Z11).
   * 여기서 거르는 것이 아니라 접근 정책이 애초에 안 보여준다.
   */
  readonly applicants: readonly Member[];
  /** 채팅방 id. 멤버가 아니면 null 이다(접근 정책) */
  readonly chatId: string | null;
  /**
   * 이 스터디를 가리키는 모집글이 하나라도 있나. 화면이 「지금 해야 할 일」을 정하는 데 쓴다 —
   * 모집글이 없으면 아무도 이 스터디를 찾을 수 없으므로 그것을 푸는 행동이 주 행동이다
   * (2026-09-06 사람 결정 · design-rules 「잉크 행동 규칙」).
   *
   * 개수가 아니라 유무만 둔다. 개수는 화면이 안 쓰고, 두면 다음 사람이 그것으로 판단을 만든다.
   */
  readonly hasPosts: boolean;
  /** 지금 이 사람의 상태 */
  readonly myStatus: ParticipationStatus | null;
};

type ProfileRow = {
  id: string;
  username: string;
  bio: string | null;
  region: string | null;
};

type ParticipantRow = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  person: ProfileRow | null;
};

const STUDY_COLUMNS = `
  id, host_id, title, summary, description, category_id, region_code,
  location_detail, meeting_mode, max_participants, closed_at, recruit_until,
  starts_on, ends_on, accepted_count, recruiting,
  category:categories!inner(name),
  region:regions!inner(name),
  slots:study_sessions(weekday, starts_at, ends_at)
`;

function toMember(row: ParticipantRow, hostId: string): Member {
  return {
    participantId: row.id,
    person: {
      id: row.user_id,
      username: row.person?.username ?? "알 수 없음",
      bio: row.person?.bio ?? null,
      regionCode: row.person?.region ?? null,
    },
    status: row.status as ParticipationStatus,
    isHost: row.user_id === hostId,
    since: row.created_at,
  };
}

/** 없거나 안 보이면 null. 지워진 스터디는 호스트에게만 보인다(조회 정책) */
export async function readStudyPage(
  studyId: string,
  userId: string | null,
): Promise<StudyPage | null> {
  const supabase = await createServerSupabase();

  const { data, error } = await supabase
    .from("studies")
    .select(STUDY_COLUMNS)
    .eq("id", studyId)
    .maybeSingle();

  if (error) throw new Error(`스터디를 읽지 못했다: ${error.message}`);
  if (!data) return null;

  const s = data as unknown as {
    id: string;
    host_id: string;
    title: string;
    summary: string | null;
    description: string;
    category_id: string;
    region_code: string;
    location_detail: string | null;
    meeting_mode: string;
    max_participants: number;
    closed_at: string | null;
    recruit_until: string | null;
    starts_on: string | null;
    ends_on: string | null;
    accepted_count: number;
    recruiting: boolean;
    category: { name: string };
    region: { name: string };
    slots: { weekday: number; starts_at: string; ends_at: string }[];
  };

  // 보이는 만큼만 온다 — 호스트면 전부, 멤버면 수락된 행만, 남이면 0건 (INV-Z11)
  const { data: rows } = await supabase
    .from("participants")
    .select("id, user_id, status, created_at, person:profiles!inner(id, username, bio, region)")
    .eq("study_id", studyId)
    .order("created_at", { ascending: true });

  const participants = ((rows ?? []) as unknown as ParticipantRow[]).map((r) =>
    toMember(r, s.host_id),
  );

  const { data: chat } = await supabase
    .from("chats")
    .select("id")
    .eq("study_id", studyId)
    .maybeSingle();

  // 한 건만 있으면 되므로 세지 않고 첫 행이 있는지만 본다.
  // 조회 정책이 감추는 모집글은 여기에도 안 온다 — 그게 맞다. 보이지 않는 글은 「이 스터디를
  // 찾을 수 있다」의 근거가 못 된다.
  const { data: anyPost } = await supabase
    .from("posts")
    .select("id")
    .eq("study_id", studyId)
    .limit(1)
    .maybeSingle();

  // **사용자로 거른다.** 0004 가 참여자 조회를 넓힌 뒤로 멤버에게는 여러 줄이 보이고,
  // 안 거르면 `maybeSingle()` 이 오류를 내며 null 이 되어 **탈퇴 버튼이 사라진다.**
  const me = userId
    ? await supabase
        .from("participants")
        .select("status")
        .eq("study_id", studyId)
        .eq("user_id", userId)
        .maybeSingle()
    : { data: null };

  const members = participants
    .filter((p) => p.status === "accepted")
    .sort((a, b) => Number(b.isHost) - Number(a.isHost));

  return {
    id: s.id,
    title: s.title,
    summary: s.summary,
    description: s.description,
    categoryId: s.category_id,
    categoryName: s.category.name,
    regionName: s.region.name,
    locationDetail: s.location_detail,
    meetingMode: s.meeting_mode as MeetingMode,
    capacity: s.max_participants,
    filled: s.accepted_count,
    recruiting: s.recruiting,
    closedAt: s.closed_at,
    recruitUntil: s.recruit_until,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    slots: s.slots.map((x) => ({
      weekday: x.weekday,
      startsAt: x.starts_at,
      endsAt: x.ends_at,
    })),
    hostId: s.host_id,
    members,
    applicants: participants.filter((p) => p.status === "pending"),
    chatId: (chat?.id as string | undefined) ?? null,
    hasPosts: anyPost !== null,
    myStatus: (me.data?.status as ParticipationStatus | undefined) ?? null,
  };
}
