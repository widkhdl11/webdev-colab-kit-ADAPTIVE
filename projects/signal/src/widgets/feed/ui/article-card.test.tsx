import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ArticleListItem } from "@/entities/article";
import { ArticleCard } from "./article-card";

/**
 * INV-S6 을 만든 이유가 "훑을 때 제일 먼저 걸리는 곳"이라, 그 훑는 화면인 카드에
 * 테스트가 있어야 한다. 상세만 잡으면 카드 제목을 원문으로 되돌려도 아무 것도 안 깨진다.
 */
const NOW = "2026-08-10T01:00:00.000Z";

function item(overrides: Partial<ArticleListItem> = {}): ArticleListItem {
  return {
    id: "a",
    title: "English title",
    titleKo: null,
    summary: "요약",
    sourceExcerpt: null,
    summaryPoints: [],
    sourceId: "hn-frontpage",
    sourceName: "Hacker News",
    sourceUrl: "https://example.com/a",
    publishedAt: "2026-08-10T00:00:00.000Z",
    tags: ["모델"],
    score: 10,
    isTrending: false,
    ...overrides,
  };
}

describe("ArticleCard — 제목 (INV-S6 / S23)", () => {
  it("번역이 있으면 카드 제목은 번역문이다", () => {
    const html = renderToStaticMarkup(
      <ArticleCard article={item({ titleKo: "한국어 제목" })} nowIso={NOW} isRead={false} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h3")?.textContent).toBe("한국어 제목");
  });

  it("실패경로: 번역이 없으면 원문 제목으로 폴백한다", () => {
    const html = renderToStaticMarkup(
      <ArticleCard article={item({ titleKo: null })} nowIso={NOW} isRead={false} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h3")?.textContent).toBe("English title");
  });

  it("카드에는 원문 병기를 하지 않는다 (병기는 상세에서만)", () => {
    // 카드는 훑는 화면이다. 제목이 두 줄이 되면 밀도가 무너진다.
    const html = renderToStaticMarkup(
      <ArticleCard article={item({ titleKo: "한국어 제목" })} nowIso={NOW} isRead={false} />,
    );
    expect(html).not.toContain("원문 제목");
    expect(html).not.toContain("English title");
  });
});
