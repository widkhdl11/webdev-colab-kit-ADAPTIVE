import type { ArticleListItem } from "../model/types";

/**
 * 화면에 보여줄 요약을 고른다 — ingestion-ranking INV-S2.
 *
 * 순서: AI 요약 → 출처가 준 요약글 → 없음.
 * "요약은 거의 무조건 나와야 한다"(2026-08-09 사용자)는 요구를 여기 한 곳에 모은다.
 * 카드와 상세가 각자 판단하면 두 화면이 다른 글을 보여주는 날이 온다.
 *
 * **어느 쪽인지 함께 돌려준다.** 출처 요약글을 AI 요약인 것처럼 보여주면
 * "AI 가 만든 것"이라는 표시가 거짓이 된다.
 */
export interface DisplaySummary {
  text: string;
  /** true 면 AI 가 만든 것. false 면 출처가 준 글이다. */
  isAi: boolean;
  /**
   * 핵심 항목 (INV-S7). **AI 요약일 때만 채워진다.**
   *
   * 출처 글을 보여주는 경우에 항목이 딸려 나가면 누가 쓴 것인지가 섞인다. 화면이
   * `isAi && points.length > 0` 을 각자 판단하지 않게 여기서 정해 준다.
   */
  points: string[];
}

export function displaySummary(
  article: Pick<ArticleListItem, "summary" | "sourceExcerpt" | "summaryPoints">,
): DisplaySummary | null {
  const ai = (article.summary ?? "").trim();
  if (ai !== "") return { text: ai, isAi: true, points: article.summaryPoints ?? [] };

  const excerpt = (article.sourceExcerpt ?? "").trim();
  // 항목은 비워서 내보낸다 — 요약만 지워지고 summary_points 가 남은 항목이 실제로 있다.
  if (excerpt !== "") return { text: excerpt, isAi: false, points: [] };

  // 둘 다 없으면 아무것도 그리지 않는다 — 빈 박스가 없는 것보다 나쁘다.
  return null;
}
