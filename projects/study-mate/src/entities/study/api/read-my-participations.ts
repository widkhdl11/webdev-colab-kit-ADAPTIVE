import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { throwDbError, throwShapeError } from "@/shared/lib/db-error";

/**
 * 신청 행에 딸린 스터디. **읽기 정책이 감추면 제목도 카테고리도 없다** — 채팅방 목록과
 * 같은 갈래다(`entities/chat/api/read-chats.ts`). 필드를 null 로 두지 않고 갈래로 나누는
 * 이유도 같다: `{ available: true, title: null }` 같은 있을 수 없는 조합이 타입을 통과하면
 * 화면이 그 조합에서 빈 제목을 그린다.
 */
export type ParticipationStudy =
  | {
      readonly available: true;
      readonly id: string;
      readonly title: string;
      readonly categoryId: string;
      readonly hostId: string;
    }
  | { readonly available: false; readonly id: string };

/**
 * 프로필의 「내 신청 현황」 한 줄.
 *
 * 상태는 셋뿐이다 — 어느 셋이고 왜 셋인지는 아래 조회 함수에 적었다.
 */
export type MyParticipation = {
  readonly id: string;
  readonly status: "pending" | "accepted" | "rejected";
  readonly createdAt: string;
  readonly study: ParticipationStudy;
};

const SHOWN_STATUSES = ["pending", "accepted", "rejected"] as const;

type Row = {
  id: string;
  study_id: string;
  status: string;
  created_at: string;
  study: { id: string; title: string; category_id: string; host_id: string } | null;
};

/** 임베드를 갈래로. 모양이 어긋나면 던진다 — 원문은 로그로만 간다(`shared/lib/db-error.ts`) */
function toStudy(participationId: string, studyId: string, embed: Row["study"]): ParticipationStudy {
  if (embed === null || embed === undefined) return { available: false, id: studyId };

  const ok =
    typeof embed === "object" &&
    typeof embed.id === "string" &&
    typeof embed.title === "string" &&
    typeof embed.category_id === "string" &&
    typeof embed.host_id === "string";
  if (!ok) throwShapeError("내 신청 현황", `신청 ${participationId}`, embed);

  return {
    available: true,
    id: embed.id,
    title: embed.title,
    categoryId: embed.category_id,
    hostId: embed.host_id,
  };
}

/**
 * 내가 낸 참가 신청.
 *
 * **`user_id` 로 거르는 것은 인가가 아니다.** 참여자 조회 정책은 내가 속한 스터디의 수락된
 * 행도 보여 주고 호스트에게는 자기 스터디의 모든 행을 보여 주므로(INV-Z11), 안 거르면
 * 남의 신청이 내 현황에 섞인다. 인가는 정책이 하고 여기서는 **내 것만 고른다**.
 *
 * **스터디는 바깥 조인이다.** `!inner` 로 묶으면 스터디가 지워졌을 때 신청 행까지 사라져,
 * 「내가 신청했던 그 스터디가 어떻게 됐지」에 아무 답이 없어진다.
 *
 * **내가 호스트인 스터디는 뺀다.** 스터디를 만들면 호스트 자신의 수락된 참여 행이 같이
 * 생기므로(0001 의 `setup_new_study`), 안 빼면 내가 만든 스터디가 위 구역과 아래 구역에
 * 두 번 나온다. 안 보이는 스터디는 뺄 필요가 없다 — 호스트는 자기가 지운 것도 보므로
 * (`studies_read`) 안 보이는 스터디의 호스트는 내가 아니다.
 *
 * **상태 다섯 중 셋만 보여 준다**(`pending` · `accepted` · `rejected`). 끝난 것 둘
 * (`withdrawn` = 내가 취소함 · `kicked` = 내보내짐)은 「현황」이 아니고, 그리려면 승인된 적
 * 없는 시각 표현을 지어내야 한다. **`rejected` 도 승인된 표현이 없다** — 보류로 올려 둔
 * 자리이고, 지금은 색·형태 없이 약한 잉크 글자로만 적는다.
 *
 * **판독기를 기본 인자로 연다.** 그러지 않으면 위의 세 판단(내 것만 · 상태 셋만 ·
 * 호스트 제외)을 통째로 지워도 검사가 전부 초록불이다 — `features/create-post` 가
 * 같은 이유로 같은 모양을 쓴다. 이 인자는 슬라이스 밖으로 내보내지 않는다(`index.ts`).
 */
export async function readMyParticipations(
  userId: string,
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<readonly MyParticipation[]> {
  const supabase = await createSupabase();
  const { data, error } = await supabase
    .from("participants")
    .select("id, study_id, status, created_at, study:studies(id, title, category_id, host_id)")
    .eq("user_id", userId)
    .in("status", SHOWN_STATUSES)
    .order("created_at", { ascending: false });

  if (error) throwDbError("내 신청 현황", error);

  return ((data ?? []) as unknown as Row[])
    .map((r) => ({
      id: r.id,
      status: r.status as MyParticipation["status"],
      createdAt: r.created_at,
      study: toStudy(r.id, r.study_id, r.study),
    }))
    .filter((p) => !(p.study.available && p.study.hostId === userId));
}
