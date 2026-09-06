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
 * — 자매 화면인 모집글 작성(`features/create-post/model/limits.ts`)은 서버에서
 * 막는데 개설 폼만 열려 있었다 (2026-09-06 code-reviewer).
 */
export const TITLE_MAX = 60;
export const SUMMARY_MAX = 80;
export const DESCRIPTION_MAX = 4000;
export const LOCATION_MAX = 60;

/** 모임 일정 입력 줄 수. 폼이 그리는 줄과 서버가 읽는 줄이 같아야 한다 */
export const SLOT_ROWS = 3;
