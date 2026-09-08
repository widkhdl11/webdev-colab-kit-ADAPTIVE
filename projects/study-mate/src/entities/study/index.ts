export {
  readMySchedule,
  readSampleSchedule,
  type ScheduledSlot,
} from "./api/read-my-schedule";
// 조회 함수 셋은 **판독기 인자를 뺀 시그니처로** 다시 내보낸다. 그 인자는 검사가
// 데이터베이스 없이 조건을 붙들려고 연 자리이고(`.claude/rules/tdd.md`), 슬라이스 밖으로
// 나가면 「인가는 정책이 한다」가 성립하는 이유 — 세션에 묶인 클라이언트 — 를 부르는 쪽이
// 고를 수 있게 된다. 검사는 같은 슬라이스 안에서 원본을 직접 import 한다.
export { readPostableStudies, readMyStudies } from "./api/public";
export type { PostableStudy } from "./api/read-my-studies";
export { canOpenPost, type MyStudy } from "./model/my-study";
export { readMyParticipations, readStudyForEdit } from "./api/public";
export type { MyParticipation, ParticipationStudy } from "./api/read-my-participations";
export { readStudyPage, type Member, type StudyPage } from "./api/read-study-detail";
export type { MeetingMode, ParticipationStatus, Person } from "./model/study";
// `meeting_mode` 는 `studies` 의 열이므로 그 이름표의 주인은 이 슬라이스다. 모집글 쪽에도
// 같은 표가 있지만 슬라이스를 가로지르는 import 를 게이트가 막으므로 한 벌로 못 합친다 —
// 대신 두 표가 갈리는 것을 `tests/integration/vocabulary.test.ts` 가 잡는다.
export { MEETING_MODE_LABEL } from "./model/limits";
export type { EditableStudy } from "./api/read-study-for-edit";

// 상한과 어휘(`model/limits.ts`)는 **여기서 다시 내보내지 않는다** — 이 배럴은 서버 전용
// 판독기를 함께 내보내므로, 폼(클라이언트 컴포넌트)이 배럴로 가져가면 브라우저 번들이
// 서버 클라이언트를 끌고 들어가 빌드가 죽는다. 쓰는 쪽은 `@/entities/study/model/limits` 를
// 직접 가리킨다 — `entities/post` 와 같은 규약이다.
