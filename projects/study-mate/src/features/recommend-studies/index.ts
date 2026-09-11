// 슬라이스 밖으로 나가는 것만.
//
// `model/pipeline.ts` 의 `recommend` 는 안 내보낸다 — 그건 판단 함수라 배선(`api/`)을
// 거쳐야 하고, 밖에서 직접 부르면 문지기(INV-G4)를 건너뛴 채로 부를 수 있다.

export { recommendForHome } from "./api/recommend-for-home";
export { RECOMMENDATION_SHOWN } from "./model/limits";
export type { RecommendOutcome } from "./model/pipeline";
export { PENDING_SUB, SECTION_TITLE, sectionCopy, type SectionCopy } from "./model/section-copy";
