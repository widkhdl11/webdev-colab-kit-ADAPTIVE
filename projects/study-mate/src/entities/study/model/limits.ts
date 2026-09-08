/**
 * 스터디 개설 폼의 상한과 어휘. 폼과 서버가 같은 값을 봐야 해서 `model/` 에 둔다 —
 * 폼은 클라이언트 컴포넌트라 서버 전용 모듈을 import 할 수 없다.
 */

/**
 * 정원의 상·하한. **데이터베이스의 `studies_max_participants_range`
 * (`supabase/migrations/0001_init.sql`)와 같은 숫자여야 한다** — 앱만 넓히면
 * 데이터베이스가 거부하고, 앱만 좁히면 이유 없이 못 만드는 스터디가 생긴다.
 */
export const CAPACITY_MIN = 2;
export const CAPACITY_MAX = 100;

/**
 * 진행 방식의 허용 값. 데이터베이스의 `studies_meeting_mode_allowed`
 * (`0002_review_fixes.sql`)와 같은 목록이어야 한다.
 */
export const MEETING_MODES = ["offline", "online", "hybrid"] as const;
export type MeetingModeValue = (typeof MEETING_MODES)[number];

export const MEETING_MODE_LABEL: Readonly<Record<MeetingModeValue, string>> = {
  offline: "오프라인",
  online: "온라인",
  hybrid: "온라인 병행",
};

/**
 * 글자 수 상한. **스키마에 길이 제약이 없어 서버의 이 값이 유일한 강제 위치다**
 * — 자매 화면인 모집글 작성(`entities/post/model/limits.ts`)은 서버에서
 * 막는데 개설 폼만 열려 있었다 (2026-09-06 code-reviewer).
 */
export const TITLE_MAX = 60;
export const SUMMARY_MAX = 80;
export const DESCRIPTION_MAX = 4000;
export const LOCATION_MAX = 60;

/** 모임 일정 입력 줄 수. 폼이 기본으로 그리는 줄 수다 */
export const SLOT_ROWS = 3;

/**
 * 서버가 읽어 주는 일정 줄의 상한.
 *
 * **`SLOT_ROWS` 와 다른 값인 이유**: 수정 폼은 이미 저장된 일정이 기본 줄 수보다 많으면
 * 그만큼 그린다(그러지 않으면 화면에 안 보인 줄이 제출과 동시에 지워진다). 그래서 서버는
 * 폼이 보낸 줄 수를 따라가는데, 그 수가 요청에서 오는 값이라 상한이 없으면 아주 큰 번호까지
 * 채워 보내는 요청 하나가 서버를 그만큼 돌린다.
 *
 * 값이 14 인 이유는 한 주에 요일이 일곱이고 같은 요일에 두 번까지는 흔하기 때문이다.
 */
export const SLOT_ROWS_MAX = 14;

/**
 * 정원 입력칸이 받을 수 있는 가장 작은 값. **상수가 아니라 지금 수락된 인원이다** (INV-P3) —
 * 데이터베이스가 거부하는 값을 입력칸이 받아 두면 사용자는 저장을 누른 뒤에야 막힌 이유를 찾는다.
 *
 * 화면이 아니라 여기 있는 이유는 이것이 표시 규칙이 아니라 도메인 규칙이기 때문이다.
 * 화면 안에 두면 검사가 못 붙든다(2026-09-07 ui-reviewer).
 */
export function capacityFloor(filled: number): number {
  return Math.max(CAPACITY_MIN, filled);
}
