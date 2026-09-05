import { createServerSupabase } from "@/shared/api/supabase/server-client";

/** 주간 플래너의 블록 하나 — 어느 스터디가 무슨 요일 몇 시에 모이는가 */
export type ScheduledSlot = {
  readonly studyId: string;
  readonly studyTitle: string;
  readonly categoryId: string;
  /** 0(일) ~ 6(토) */
  readonly weekday: number;
  readonly startsAt: string;
};

type Row = {
  study: {
    id: string;
    title: string;
    category_id: string;
    slots: { weekday: number; starts_at: string }[];
  };
};

function flatten(rows: readonly Row[]): ScheduledSlot[] {
  return rows.flatMap((r) =>
    r.study.slots.map((s) => ({
      studyId: r.study.id,
      studyTitle: r.study.title,
      categoryId: r.study.category_id,
      weekday: s.weekday,
      startsAt: s.starts_at,
    })),
  );
}

/**
 * 내가 참여 중인 스터디의 모임 일정.
 *
 * **사용자로 거른다.** 0004 가 참여자 조회를 넓힌 뒤로 "내가 속한 스터디의 수락된 행"이
 * 전부 보이므로, 안 거르면 멤버 4명짜리 스터디의 모임 시간이 플래너에 네 번 그려진다.
 * 지워진 스터디는 `studies!inner` 조인이 걸러 낸다(조회 정책이 감춘다).
 */
export async function readMySchedule(userId: string): Promise<readonly ScheduledSlot[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("participants")
    .select("study:studies!inner(id, title, category_id, slots:study_sessions(weekday, starts_at))")
    .eq("user_id", userId)
    .eq("status", "accepted");

  if (error) throw new Error(`내 일정을 읽지 못했다: ${error.message}`);
  return flatten((data ?? []) as unknown as Row[]);
}

/**
 * 로그인하지 않은 사람에게 보여줄 **예시** 일정. 지어낸 값이 아니라 실제로 모집 중인
 * 스터디의 모임 시간이고, 화면이 그렇게 밝힌다(제품 원칙 5 「정직한 데모」).
 */
export async function readSampleSchedule(limit = 4): Promise<readonly ScheduledSlot[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("studies")
    .select("id, title, category_id, slots:study_sessions(weekday, starts_at)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`예시 일정을 읽지 못했다: ${error.message}`);
  return flatten(((data ?? []) as unknown as Row["study"][]).map((study) => ({ study })));
}
