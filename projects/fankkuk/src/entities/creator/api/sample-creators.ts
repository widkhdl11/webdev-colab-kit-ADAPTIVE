// 예시 데이터 — DB 전에 화면 흐름을 보기 위한 것. 실제 크리에이터가 아니다.
export type CreatorSummary = { id: string; name: string; channel: string };

export const SAMPLE_CREATORS: readonly CreatorSummary[] = [
  { id: "c1", name: "하루", channel: "치지직" },
  { id: "c2", name: "모모", channel: "유튜브" },
  { id: "c3", name: "새벽달", channel: "SOOP" },
];

/** 예시에서 로그인한 크리에이터. */
export const SAMPLE_SIGNED_IN_CREATOR_ID = "c1";
