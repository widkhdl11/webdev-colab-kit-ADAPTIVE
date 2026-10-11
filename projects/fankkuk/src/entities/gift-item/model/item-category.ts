// 물품 종류 고정 목록 (docs/specs/hard-items.md INV-H1).
// 등록 화면이 고르고, 크리에이터의 받기 어려운 품목도 같은 목록에서 고른다. DB(item_category_label)와 같은 코드·이름·순서다.
// 냉장·냉동·음식·액체는 서비스 차원 금지품이라 목록에 없다 — 처음부터 고를 수 없다.

export const ITEM_CATEGORIES = ["doll", "flower", "clothing", "beauty", "large", "stationery", "electronics", "other"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  doll: "인형·쿠션",
  flower: "꽃",
  clothing: "의류",
  beauty: "향수·화장품",
  large: "대형 물품",
  stationery: "문구",
  electronics: "전자기기",
  other: "기타",
};

/** INV-H1: 기타만 직접 적는 글 — 1~30자. */
export const ITEM_OTHER_MAX = 30;

export function isItemCategory(v: unknown): v is ItemCategory {
  return typeof v === "string" && (ITEM_CATEGORIES as readonly string[]).includes(v);
}

/** 목록 순서로 줄 세우고 겹친 것을 뺀다(INV-H6 — 공개 문구의 품목 순서). */
export function sortCategories(list: readonly ItemCategory[]): ItemCategory[] {
  return ITEM_CATEGORIES.filter((c) => list.includes(c));
}

/** INV-H2: 전자기기를 고르면 전자기기·금속 신고가 켜진다(DB 등록 함수도 켠다). */
export function forcesMetalReport(category: ItemCategory | null | undefined): boolean {
  return category === "electronics";
}

// ── 받침에 따른 조사 ─────────────

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 마지막 글자에 받침이 있는가. 한글이 아니면(숫자·영문 등) 받침 없음으로 친다. */
export function hasFinalConsonant(word: string): boolean {
  const last = word.trim().at(-1);
  if (!last) return false;
  const code = last.codePointAt(0) ?? 0;
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return false;
  return (code - HANGUL_FIRST) % 28 !== 0;
}

/** 「을/를」 — 쿠션을 · 의류를. */
export function withObjectParticle(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "을" : "를"}`;
}

/** 「은/는」 — 꽃은 · 문구는. */
export function withTopicParticle(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "은" : "는"}`;
}
