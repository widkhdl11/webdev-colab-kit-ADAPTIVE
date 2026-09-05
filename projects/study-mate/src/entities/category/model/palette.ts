import type { Highlight } from "@/shared/ui/highlight";

/**
 * 대분류 8종의 형광펜 색. design-rules 「카테고리 8색 배정」의 표를 그대로 옮긴 것이고,
 * 아이디는 마이그레이션의 `categories` 시드와 같다.
 *
 * 배정이 코드에 있는 이유: 색은 시각 기준이 정한 값이라 데이터베이스가 바뀐다고
 * 따라 바뀌면 안 된다. 반대로 이름은 데이터베이스에서 읽는다 — 거기가 원본이다.
 */
export const CATEGORY_COLORS: Readonly<Record<string, Highlight>> = {
  it: "sky",
  design: "pink",
  language: "lavender",
  business: "lime",
  cert: "yellow",
  academic: "orange",
  hobby: "coral",
  growth: "mint",
};

/** 모르는 아이디(중·소분류나 나중에 늘어난 대분류)는 색을 갖지 않는다 */
export const FALLBACK_COLOR: Highlight = "yellow";

export function categoryColor(categoryId: string | null | undefined): Highlight {
  if (!categoryId) return FALLBACK_COLOR;
  return CATEGORY_COLORS[categoryId] ?? FALLBACK_COLOR;
}
