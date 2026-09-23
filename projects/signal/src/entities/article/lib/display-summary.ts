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
  /**
   * 한 줄 요약 (INV-S8). **AI 요약일 때만 채워진다** — 출처 글을 보여주는 화면에 우리 문장을
   * 섞지 않는다(INV-S2). `points` 와 같은 이유로 화면이 각자 판단하지 않게 여기서 정한다.
   */
  oneLine: string | null;
  /**
   * 한 줄 요약이 없는 AI 요약 = 옛 형식 (2026-09-23 사용자 결정: 옛 글은 다시 요약하지 않는다).
   * 화면은 이 값으로 옛 모양(문단)을 그린다. 출처 글이면 늘 false 다.
   */
  isLegacy: boolean;
}

export function displaySummary(
  article: Pick<ArticleListItem, "summary" | "sourceExcerpt" | "summaryPoints"> & {
    oneLine?: string | null;
  },
): DisplaySummary | null {
  const ai = (article.summary ?? "").trim();
  if (ai !== "") {
    const oneLine = (article.oneLine ?? "").trim() || null;
    return {
      text: ai,
      isAi: true,
      points: article.summaryPoints ?? [],
      oneLine,
      isLegacy: oneLine === null,
    };
  }

  const excerpt = (article.sourceExcerpt ?? "").trim();
  // 항목은 비워서 내보낸다 — 요약만 지워지고 summary_points 가 남은 항목이 실제로 있다.
  // 한 줄 요약도 같다 — 요약만 지워지고 one_line 이 남은 항목에서 우리 문장이 새어 나가면 안 된다.
  if (excerpt !== "") return { text: excerpt, isAi: false, points: [], oneLine: null, isLegacy: false };

  // 둘 다 없으면 아무것도 그리지 않는다 — 빈 박스가 없는 것보다 나쁘다.
  return null;
}
