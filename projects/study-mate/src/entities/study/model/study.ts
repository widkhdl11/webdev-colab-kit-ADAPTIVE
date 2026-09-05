/**
 * 스터디 슬라이스의 어휘.
 *
 * **모집글 슬라이스에도 같은 이름의 union 이 있다.** 층 규칙이 엔티티끼리의 import 를
 * 막고(공유는 아래 레이어로), 이 값들은 도메인 지식이라 shared 로도 못 내린다.
 * 그래서 슬라이스마다 제 어휘를 갖는다.
 *
 * **두 벌이 어긋나는 것은 테스트가 막는다** — 단일 출처는 데이터베이스의 허용값 제약이고
 * (`participants_status_allowed` · `studies_meeting_mode_allowed`),
 * `tests/integration/vocabulary.test.ts` 가 양쪽이 그것과 같은지 확인한다.
 */

/** 진행 방식 — 「온라인」은 지역이 아니라 이 축이다 (docs/IA.md) */
export type MeetingMode = "offline" | "online" | "hybrid";

/** 참가 신청이 지금 어느 상태인가 (INV-P7) */
export type ParticipationStatus = "pending" | "accepted" | "rejected" | "withdrawn" | "kicked";

/** 화면에 이름과 얼굴로 나오는 사람. 이메일은 여기 없다 — 화면이 안 쓴다 */
export type Person = {
  readonly id: string;
  readonly username: string;
  readonly bio: string | null;
  readonly regionCode: string | null;
};
