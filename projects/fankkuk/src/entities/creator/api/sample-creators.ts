// 예시 데이터 — DB 전에 화면 흐름을 보기 위한 것. 실제 크리에이터가 아니다.
export type CreatorSummary = { id: string; name: string; channel: string };

export const SAMPLE_CREATORS: readonly CreatorSummary[] = [
  { id: "c1", name: "하루", channel: "치지직" },
  { id: "c2", name: "모모", channel: "유튜브" },
  { id: "c3", name: "새벽달", channel: "SOOP" },
];

/** 예시에서 로그인한 크리에이터. */
export const SAMPLE_SIGNED_IN_CREATOR_ID = "c1";

// ── 크리에이터 찾기·크리에이터 페이지·팔로우 화면용 예시 (2026-10-02, 시안 v4 creators·creator·my-following) ──
// 위 SAMPLE_CREATORS 는 주문 예시가 읽으므로 그대로 두고, 목록 화면에만 쓰는 크리에이터를 따로 덧붙인다.

/** 크리에이터 찾기 목록에만 더 보이는 예시 크리에이터(지어낸 이름). */
export const SAMPLE_MORE_CREATORS: readonly CreatorSummary[] = [
  { id: "c4", name: "별이", channel: "유튜브" },
  { id: "c5", name: "솜사탕", channel: "치지직" },
  { id: "c6", name: "도담", channel: "유튜브" },
  { id: "c7", name: "보리", channel: "SOOP" },
  { id: "c8", name: "라온", channel: "치지직" },
  { id: "c9", name: "나무", channel: "유튜브" },
  { id: "c10", name: "시월", channel: "SOOP" },
  { id: "c11", name: "구름", channel: "유튜브" },
  { id: "c12", name: "해든", channel: "치지직" },
];

/** 크리에이터 찾기에 보이는 전체(본인 확인을 마친 크리에이터). */
export const SAMPLE_LISTED_CREATORS: readonly CreatorSummary[] = [...SAMPLE_CREATORS, ...SAMPLE_MORE_CREATORS];

/** 목록·크리에이터 페이지에 보이는 소개 칸. CreatorSummary 와 id 로 잇는다. */
export type CreatorProfile = {
  creatorId: string;
  category: string;
  channelTitle: string;
  intro: string;
  /** 검색에 같이 걸리는 로마자 이름. */
  alias: string;
  /** 최근 30일 평균 승인 시간(시간 단위). */
  avgApprovalHours: number;
  /** 얼굴 자리표시 동그라미 색 — 프로필 사진이 붙으면 사라질 값이라 토큰이 아니라 데이터로 둔다. */
  faceTone: string;
};

export const SAMPLE_CREATOR_PROFILES: readonly CreatorProfile[] = [
  { creatorId: "c1", category: "게임", channelTitle: "하루의 놀이터", intro: "게임 방송을 해요.", alias: "haru", avgApprovalHours: 2, faceTone: "var(--face-6)" },
  { creatorId: "c2", category: "노래", channelTitle: "모모네 거실", intro: "노래 방송을 해요.", alias: "momo", avgApprovalHours: 4, faceTone: "var(--face-3)" },
  { creatorId: "c3", category: "토크", channelTitle: "새벽달 라디오", intro: "새벽에 이야기를 나눠요.", alias: "saebyeokdal", avgApprovalHours: 1, faceTone: "var(--face-5)" },
  { creatorId: "c4", category: "그림", channelTitle: "별이의 작업실", intro: "그림 그리는 방송을 해요.", alias: "byeol", avgApprovalHours: 3, faceTone: "var(--face-1)" },
  { creatorId: "c5", category: "먹방", channelTitle: "솜사탕 식탁", intro: "맛있는 걸 같이 먹어요.", alias: "somsatang", avgApprovalHours: 6, faceTone: "var(--face-4)" },
  { creatorId: "c6", category: "운동", channelTitle: "도담 홈트", intro: "집에서 같이 운동해요.", alias: "dodam", avgApprovalHours: 2, faceTone: "var(--face-2)" },
  { creatorId: "c7", category: "여행", channelTitle: "보리의 지구본", intro: "여행 이야기를 들려 드려요.", alias: "bori", avgApprovalHours: 5, faceTone: "var(--face-1)" },
  { creatorId: "c8", category: "게임", channelTitle: "라온 아케이드", intro: "옛날 게임을 해요.", alias: "raon", avgApprovalHours: 3, faceTone: "var(--face-2)" },
  { creatorId: "c9", category: "공부", channelTitle: "나무 스터디룸", intro: "같이 공부해요.", alias: "namu", avgApprovalHours: 1, faceTone: "var(--face-3)" },
  { creatorId: "c10", category: "음악", channelTitle: "시월 라이브", intro: "직접 연주해요.", alias: "siwol", avgApprovalHours: 8, faceTone: "var(--face-4)" },
  { creatorId: "c11", category: "일상", channelTitle: "구름 브이로그", intro: "하루하루를 기록해요.", alias: "gureum", avgApprovalHours: 4, faceTone: "var(--face-5)" },
  { creatorId: "c12", category: "요리", channelTitle: "해든 부엌", intro: "집밥을 만들어요.", alias: "haedeun", avgApprovalHours: 2, faceTone: "var(--face-6)" },
];

/** 예시에서 로그인한 팬이 팔로우한 크리에이터. 메인의 팔로우 줄·내 정보 화면과 같은 여섯 명이다. */
export const SAMPLE_FOLLOWED_CREATOR_IDS: readonly string[] = ["c1", "c2", "c3", "c4", "c5", "c6"];
