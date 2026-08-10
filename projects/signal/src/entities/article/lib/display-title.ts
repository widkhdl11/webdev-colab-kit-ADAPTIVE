import type { ArticleListItem } from "../model/types";

/**
 * 화면에 보여줄 제목을 고른다 — ingestion-ranking INV-S6.
 *
 * 번역문이 있으면 번역문을, 없으면 원문 제목을 쓴다. **원문을 버리지 않는다** —
 * 원문이 진실이라는 게 이 제품의 규칙이고(INV-S1), 번역이 틀렸을 때 대조할 것이 있어야 한다.
 * 상세 화면이 병기할 수 있도록 원문을 같이 돌려준다.
 *
 * displaySummary 와 같은 이유로 여기 한 곳에 모은다 — 카드와 상세가 각자 판단하면
 * 두 화면이 다른 제목을 보여주는 날이 온다.
 */
export interface DisplayTitle {
  text: string;
  /** 병기할 원문 제목. 번역이 없거나 원문과 같으면 null — 같은 문장을 두 번 보여주지 않는다. */
  original: string | null;
  isTranslated: boolean;
}

export function displayTitle(
  article: Pick<ArticleListItem, "title" | "titleKo">,
): DisplayTitle {
  const ko = (article.titleKo ?? "").trim();
  const original = article.title;

  // 모델이 빈 문자열을 돌려줄 수 있다. 그걸 제목으로 쓰면 카드에서 제목이 사라진다.
  if (ko === "" || ko === original.trim()) {
    return { text: original, original: null, isTranslated: false };
  }
  return { text: ko, original, isTranslated: true };
}
