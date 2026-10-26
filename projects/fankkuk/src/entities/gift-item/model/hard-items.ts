import { ITEM_CATEGORY_LABEL, sortCategories, withObjectParticle, withTopicParticle, type ItemCategory } from "./item-category";

// 받기 어려운 품목 — 화면 쪽 문구·판정 (docs/specs/hard-items.md INV-H4·H5·H6·H8).
// 크리에이터는 고르기만 하고, 공개 문구는 여기 정해진 틀로만 만든다(추가분 불변식 21 — 문장 직접 쓰는 칸 없음).
// 등록을 막는 판정은 DB 등록 함수가 다시 한다(INV-H7) — 여기는 표시와 안내만.

export const HARD_REASONS = ["many", "storage", "away", "none"] as const;
export type HardReason = (typeof HARD_REASONS)[number];
export const HARD_PERIODS = ["week1", "week2", "month1", "manual"] as const;
export type HardPeriod = (typeof HARD_PERIODS)[number];
export const HARD_ACTIONS = ["notice", "block"] as const;
export type HardAction = (typeof HARD_ACTIONS)[number];

/** INV-H4: 이유 넷 — 「표시 안 함」은 공개 문구에 이유를 붙이지 않는다. */
export const HARD_REASON_LABEL: Record<HardReason, string> = {
  many: "이미 많이 받았어요",
  storage: "보관할 곳이 부족해요",
  away: "잠시 집을 비워요",
  none: "이유 표시 안 함",
};
/** 설정 화면의 이유 선택지 이름(문구 다듬은본 10-26) — 공개 문구에 붙는 문장은 위 HARD_REASON_LABEL 그대로다. */
export const HARD_REASON_OPTION_LABEL: Record<HardReason, string> = {
  many: "이미 많이 받음",
  storage: "보관 공간 부족",
  away: "일시 부재",
  none: "이유 표시 안 함",
};
export const HARD_PERIOD_LABEL: Record<HardPeriod, string> = { week1: "1주", week2: "2주", month1: "한 달", manual: "직접 해제할 때까지" };
export const HARD_ACTION_LABEL: Record<HardAction, string> = { notice: "안내만 표시", block: "선물 등록 제한" };

/** 공개 설정 — 크리에이터 페이지·등록 화면이 읽는다. 끝나는 날은 없다(INV-H6). 살아 있는 설정만 온다(INV-H5). */
export type HardItems = { categories: readonly ItemCategory[]; reason: HardReason; action: HardAction };
/** 크리에이터 본인 설정 — 기간과 끝나는 날(YYYY-MM-DD, 직접 해제면 null)은 이 화면에만. */
export type MyHardItems = HardItems & { period: HardPeriod; endsOn: string | null };

/**
 * 설정 화면 미리보기 두 줄 — 「현재 받기 어려운 선물: {품목들}」과 이유(고르지 않았으면 null). 품목이 없으면 null.
 */
export function hardItemsPreview(h: Pick<HardItems, "categories" | "reason">): { items: string; reason: string | null } | null {
  const labels = sortCategories(h.categories).map((c) => ITEM_CATEGORY_LABEL[c]);
  if (labels.length === 0) return null;
  return { items: `현재 받기 어려운 선물: ${labels.join(", ")}`, reason: h.reason === "none" ? null : HARD_REASON_OPTION_LABEL[h.reason] };
}

/**
 * INV-H6: 「지금은 {품목들}을 받기 어려워요 ㅠㅠ {이유}」. 품목은 목록 순서로 「, 」로 잇고 마지막 품목 받침에 따라 을/를.
 * 이유 「표시 안 함」이면 「ㅠㅠ」까지만. 품목이 없으면 null(문구 없음).
 */
export function hardItemsNotice(h: Pick<HardItems, "categories" | "reason"> | null | undefined): string | null {
  if (!h) return null;
  const labels = sortCategories(h.categories).map((c) => ITEM_CATEGORY_LABEL[c]);
  if (labels.length === 0) return null;
  const head = `지금은 ${withObjectParticle(labels.join(", "))} 받기 어려워요 ㅠㅠ`;
  return h.reason === "none" ? head : `${head} ${HARD_REASON_LABEL[h.reason]}`;
}

/**
 * INV-H8: 등록 화면 안내 — 「{공개 이름}님이 지금 {품목}은 받기 어렵대요. 다른 선물을 고르시겠어요?」(받침에 따라 은/는).
 * 「등록 막기」면 그대로 보낼 수 없으니 묻지 않고 「… 받기 어렵대요. 다른 선물을 골라 주세요.」로 끝낸다.
 */
export function hardItemFanMessage(creatorName: string, category: ItemCategory, blocks = false): string {
  const head = `${creatorName}님이 지금 ${withTopicParticle(ITEM_CATEGORY_LABEL[category])} 받기 어렵대요.`;
  return blocks ? `${head} 다른 선물을 골라 주세요.` : `${head} 다른 선물을 고르시겠어요?`;
}

/**
 * INV-H8: 고른 종류가 받기 어려운 품목과 겹치면 안내 문구와 막는지 여부. 겹치지 않거나 설정이 없으면 null.
 * 「안내만」이면 blocks=false — 팬이 그대로 다음 단계로 갈 수 있다.
 */
export function hardItemOverlap(
  creatorName: string,
  hard: HardItems | null | undefined,
  category: ItemCategory | null | undefined,
): { message: string; blocks: boolean } | null {
  if (!hard || !category || !hard.categories.includes(category)) return null;
  const blocks = hard.action === "block";
  return { message: hardItemFanMessage(creatorName, category, blocks), blocks };
}

/** 설정 화면의 남은 기간 — 끝나는 날이 10월 18일이면 오늘(10월 11일) 「10월 17일까지 (7일 남음)」. 직접 해제면 「직접 해제할 때까지」. today 는 한국 시간 날짜. */
export function hardItemsRemaining(endsOn: string | null, today: { year: number; month: number; day: number }): string {
  if (endsOn === null) return "직접 해제할 때까지";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsOn);
  if (!m) return endsOn;
  const end = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = Date.UTC(today.year, today.month - 1, today.day);
  const left = Math.round((end - now) / 86_400_000);
  // 끝나는 날 0시에 사라지므로 마지막으로 보이는 날은 그 전날이다
  const last = new Date(end - 86_400_000);
  return `${last.getUTCMonth() + 1}월 ${last.getUTCDate()}일까지 (${left}일 남음)`;
}
