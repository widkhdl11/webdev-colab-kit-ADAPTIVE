import type { CreatorProfile, CreatorSummary } from "../api/sample-creators";

// 크리에이터 목록·페이지가 보여 주는 한 사람의 모양 — 기본 정보 + 소개 + 팔로우 여부.

export type CreatorCard = {
  id: string;
  name: string;
  /** 방송 플랫폼(치지직·유튜브·SOOP). */
  platform: string;
  category: string;
  channelTitle: string;
  intro: string;
  alias: string;
  avgApprovalHours: number;
  faceTone: string;
  following: boolean;
};

/** 크리에이터 순서를 따르고, 소개가 없는 크리에이터(본인 확인 전)는 빼고 만든다. */
export function toCreatorCards(
  creators: readonly CreatorSummary[],
  profiles: readonly CreatorProfile[],
  followedIds: readonly string[],
): CreatorCard[] {
  const followed = new Set(followedIds);
  return creators.flatMap((c) => {
    const p = profiles.find((x) => x.creatorId === c.id);
    if (!p) return [];
    return [
      {
        id: c.id,
        name: c.name,
        platform: c.channel,
        category: p.category,
        channelTitle: p.channelTitle,
        intro: p.intro,
        alias: p.alias,
        avgApprovalHours: p.avgApprovalHours,
        faceTone: p.faceTone,
        following: followed.has(c.id),
      },
    ];
  });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** 실시간 검색 — 이름·로마자 이름·분야·채널 이름 중 하나에 검색어가 들어 있으면 통과. 띄어쓰기·대소문자는 무시한다. */
export function matchesCreatorQuery(card: CreatorCard, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize([card.name, card.alias, card.category, card.channelTitle].join(" ")).includes(q);
}
