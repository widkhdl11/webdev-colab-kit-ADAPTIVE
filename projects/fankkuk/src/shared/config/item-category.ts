// 물품 종류 고정 목록 (docs/specs/hard-items.md INV-H1) — 목록·이름·선물 종류 이름.
// entities/gift-item 과 entities/order(승인 서명 원문 INV-S1)가 같이 쓰므로 아래 레이어에 둔다. 나머지 규칙은 entities/gift-item/model/item-category.ts.
// DB(item_category_label)와 같은 코드·이름·순서다.

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

/**
 * 「선물 종류」 — 승인 서명 원문(approval-signature INV-S1)과 승인 요청 알림톡이 같은 정의를 쓴다.
 * 팬이 고른 목록 값의 이름이다. 기타는 「기타」(팬이 직접 쓴 글은 쓰지 않는다), 종류 칸이 비어 있는 예전 주문도 「기타」.
 * DB 의 원문 함수는 같은 규칙으로 item_category_label(coalesce(item_category, 'other')) 를 쓴다.
 */
export function giftKindLabelOf(category: string | null | undefined): string {
  return isItemCategory(category) ? ITEM_CATEGORY_LABEL[category] : ITEM_CATEGORY_LABEL.other;
}

export function isItemCategory(v: unknown): v is ItemCategory {
  return typeof v === "string" && (ITEM_CATEGORIES as readonly string[]).includes(v);
}
