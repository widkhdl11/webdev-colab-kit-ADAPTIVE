/**
 * 형광펜 8색의 이름. 무엇에 쓰이는지(어느 카테고리인지)는 여기서 모른다 —
 * 그 배정은 도메인 지식이라 entities 쪽에 있다.
 */
export const HIGHLIGHTS = [
  "yellow",
  "mint",
  "coral",
  "lavender",
  "sky",
  "orange",
  "lime",
  "pink",
] as const;

export type Highlight = (typeof HIGHLIGHTS)[number];

/** 인라인 style 로 넘길 때 쓰는 변수 이름 */
export const highlightVar = (color: Highlight) => `var(--hl-${color})`;
