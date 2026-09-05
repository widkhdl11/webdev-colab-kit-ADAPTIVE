import type { MeetingMode } from "./post-summary";

/** 참가 신청이 지금 어느 상태인가. 데이터베이스의 허용값과 같은 다섯 (INV-P7) */
export type ParticipationStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "kicked";

/** 화면에 이름과 얼굴로 나오는 사람. 이메일은 여기 없다 — 화면이 안 쓴다 */
export type Person = {
  readonly id: string;
  readonly username: string;
  readonly bio: string | null;
  readonly regionCode: string | null;
};

export type DetailSlot = {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
};

export type StudyDetail = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly categoryId: string;
  readonly categoryName: string;
  readonly regionCode: string;
  readonly regionName: string;
  readonly locationDetail: string | null;
  readonly meetingMode: MeetingMode;
  readonly capacity: number;
  readonly filled: number;
  readonly recruiting: boolean;
  readonly recruitUntil: string | null;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly slots: readonly DetailSlot[];
  readonly host: Person | null;
  readonly hostId: string;
};

export type PostDetail = {
  readonly id: string;
  readonly title: string;
  readonly summary: string | null;
  readonly content: string;
  readonly createdAt: string;
  readonly viewsCount: number;
  readonly likesCount: number;
  readonly author: Person | null;
  readonly likedByMe: boolean;
  /** 지금 이 사람의 신청 상태. 로그인하지 않았거나 신청한 적 없으면 null */
  readonly myParticipation: ParticipationStatus | null;
  readonly study: StudyDetail;
};

/** 이 사람이 지금 무엇을 할 수 있는가. 화면의 버튼 하나가 이 값으로 정해진다 */
export type ApplyState =
  | "signed-out" // 로그인해야 신청할 수 있다
  | "host" // 내가 연 스터디다
  | "can-apply"
  | "pending" // 신청함 · 호스트의 승인 대기
  | "joined" // 참여 중
  | "rejected"
  | "left" // 탈퇴·강퇴로 끝났다
  | "closed"; // 모집이 끝났다

export function applyState(detail: PostDetail, userId: string | null): ApplyState {
  // 모집이 끝났으면 로그인부터 하라고 하지 않는다 — 로그인해도 신청할 수 없다.
  if (userId === null) return detail.study.recruiting ? "signed-out" : "closed";
  if (userId === detail.study.hostId) return "host";

  switch (detail.myParticipation) {
    case "pending":
      return "pending";
    case "accepted":
      return "joined";
    case "rejected":
      return "rejected";
    case "withdrawn":
    case "kicked":
      return "left";
    default:
      // 신청한 적이 없다. 자리가 남았을 때만 신청할 수 있다 (INV-P4)
      return detail.study.recruiting ? "can-apply" : "closed";
  }
}
