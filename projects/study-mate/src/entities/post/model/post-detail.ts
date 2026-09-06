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
  /**
   * 호스트가 지운 것으로 표시했는가 (INV-Z6).
   *
   * **남에게는 이 값이 참인 모집글이 아예 안 온다** — `posts_read` 가 `study_is_visible` 을
   * 그대로 부르고, 그것은 「안 지워졌거나 내가 호스트」다. 그래서 이 값이 참인 채로 이
   * 화면에 도달하는 사람은 호스트 자신뿐이고, 화면이 그에게만 다르게 말해야 하는 자리가 있다.
   */
  readonly deleted: boolean;
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
  /**
   * 작성자의 id. `author.id` 와 같은 값이지만 **프로필을 못 읽는 사람에게도 있다** —
   * INV-Z13 은 볼 이유가 없는 사람에게 프로필 행을 안 보여 주므로 `author` 는 null 이
   * 될 수 있다. 「내가 쓴 글인가」를 그 null 로 판단하면, 프로필이 안 읽히는 날 작성자에게
   * 수정 자리가 사라진다.
   */
  readonly authorId: string;
  readonly likedByMe: boolean;
  /** 지금 이 사람의 신청 상태. 로그인하지 않았거나 신청한 적 없으면 null */
  readonly myParticipation: ParticipationStatus | null;
  readonly study: StudyDetail;
};

/**
 * 이 글을 쓴 사람이 지금 보고 있는 사람인가. 수정 자리를 낼지가 이 값으로 정해진다.
 *
 * **`author` 의 null 로 판단하지 않는다** — INV-Z13 이 프로필을 감추는 사람에게는 그 값이
 * null 이라, 그것으로 보면 「프로필이 안 읽히니 내 글도 아니다」가 된다.
 *
 * 판정이 화면이 아니라 여기 있는 이유는 `applyState` 와 같다 — 「누가 무엇을 할 수 있나」는
 * 도메인 판단이고, 화면은 그것을 가져다 자리만 낸다.
 */
export function isPostAuthor(detail: PostDetail, userId: string | null): boolean {
  return userId !== null && userId === detail.authorId;
}

/**
 * 지금 이 글을 고칠 수 있는가 — 수정 자리를 낼지가 이 값으로 정해진다.
 *
 * **작성자인 것만으로는 부족하다.** 호스트가 지운 스터디의 모집글은 그 사람에게 계속
 * 보이는데(위 `deleted` 주석), 수정 화면은 그 글을 안 연다 — 「내가 쓴 모집글」 목록이
 * 이미 빼 두었기 때문이다(INV-Z10 이 정한 방향). 두 판단이 갈리면 **자기에게만 보이는
 * 버튼을 눌렀는데 404** 가 난다 (2026-09-06 code-reviewer).
 */
export function canEditPost(detail: PostDetail, userId: string | null): boolean {
  return isPostAuthor(detail, userId) && !detail.study.deleted;
}

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
