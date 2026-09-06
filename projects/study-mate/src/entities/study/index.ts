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
export { readMyParticipations } from "./api/public";
export type { MyParticipation, ParticipationStudy } from "./api/read-my-participations";
export { readStudyPage, type Member, type StudyPage } from "./api/read-study-detail";
export type { MeetingMode, ParticipationStatus, Person } from "./model/study";
