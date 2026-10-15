import { approvalTimeOf } from "./approval-time";
import type { CreatorProfile, CreatorSummary } from "./creator";
import type { CreatorColors } from "./creator-color";

// 크리에이터 목록·페이지가 보여 주는 한 사람의 모양 — 기본 정보 + 소개 + 팔로우 여부.

export type CreatorCard = {
  id: string;
  name: string;
  /** 방송 플랫폼(치지직·유튜브·SOOP). */
  platform: string;
  /** 태그 — 숨기지 않은 선택지 이름만, 선택지 순서(creator-tags INV-T4). */
  tags: readonly string[];
  channelTitle: string;
  intro: string;
  alias: string;
  /** 평균 승인 시간(분). approvalTimeOf 가 정한다. */
  approvalMinutes: number | null;
  faceTone: string;
  following: boolean;
  /** 링크용 아이디 — 없으면 null(creator-link INV-E5: 링크는 creatorPagePath 로 만든다). */
  handle: string | null;
  /** 프로필 사진 저장소 경로 — 없으면 null(INV-E9). */
  photoPath: string | null;
  /** 퍼스널 컬러·팬컬러(creator-link INV-E13) — 공개 값. 없으면 기본 모양. */
  colors?: CreatorColors;
};

/**
 * 크리에이터 순서를 따르고, 소개가 없는 크리에이터(본인 확인 전)는 빼고 만든다.
 * orderApprovalMinutes 는 주문 기록으로 계산한 크리에이터별 평균 승인 시간(분) — 없는 크리에이터는 소개 칸 값을 쓴다.
 */
export function toCreatorCards(
  creators: readonly CreatorSummary[],
  profiles: readonly CreatorProfile[],
  followedIds: readonly string[],
  orderApprovalMinutes: Readonly<Record<string, number | null>> = {},
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
        tags: p.tags,
        channelTitle: p.channelTitle,
        intro: p.intro,
        alias: p.alias,
        approvalMinutes: approvalTimeOf(orderApprovalMinutes[c.id] ?? null, p.avgApprovalHours),
        faceTone: p.faceTone,
        following: followed.has(c.id),
        handle: p.handle ?? null,
        photoPath: p.photoPath ?? null,
        ...(p.colors ? { colors: p.colors } : {}),
      },
    ];
  });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "");
}

/** 검색이 보는 칸. 소개 칸(로마자 이름·태그·채널 이름)은 없을 수 있다. */
export type CreatorSearchFields = Pick<CreatorCard, "name" | "platform"> &
  Partial<Pick<CreatorCard, "alias" | "tags" | "channelTitle">>;

/**
 * 실시간 검색 — 이름·로마자 이름·태그·채널 이름·방송 플랫폼 중 하나에 검색어가 들어 있으면 통과. 띄어쓰기·대소문자는 무시한다.
 * 크리에이터 찾기와 선물 보내기의 크리에이터 고르기가 같은 규칙을 쓴다.
 */
export function matchesCreatorQuery(card: CreatorSearchFields, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  return normalize([card.name, card.alias, ...(card.tags ?? []), card.channelTitle, card.platform].filter(Boolean).join(" ")).includes(q);
}
