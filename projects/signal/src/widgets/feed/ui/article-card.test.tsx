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
    officialBasis: "none",
    score: 10,
    isTrending: false,
    ...overrides,
  };
}

/** 공식 표시 요소. 없으면 null — "표시가 안 붙는다"를 그대로 확인할 수 있다. */
function officialMark(html: string): Element | null {
  return new DOMParser()
    .parseFromString(html, "text/html")
    .querySelector("[data-official]");
}

/** 눈에 보이는 문구만. sr-only 설명은 빼고 읽는다. */
function visibleText(el: Element | null): string {
  if (el === null) return "";
  return [...el.childNodes]
    .filter((n) => !(n instanceof Element && n.className === "sr-only"))
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();
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

/**
 * 공식 표시 — content-selection INV-O2.
 *
 * 스펙이 요구하는 것은 "표시가 있다"가 아니라 **두 근거가 서로 다르게 보인다**는 것이다.
 * 그래서 문구를 각각 고정한다 — 형태(채움/점선)는 CSS 라 여기서 못 보고, design-rules
 * 2026-08-11 블록도 확실성 차이를 나르는 것은 색·형태가 아니라 **말**이라고 정해 뒀다.
 */
describe("ArticleCard — 공식 표시 (INV-O2)", () => {
  const render = (basis: ArticleListItem["officialBasis"]) =>
    renderToStaticMarkup(
      <ArticleCard article={item({ officialBasis: basis })} nowIso={NOW} isRead={false} />,
    );

  it("INV-O2 (CS8): 주소 근거와 내용 근거의 문구가 서로 다르다", () => {
    const byUrl = officialMark(render("byUrl"));
    const byContent = officialMark(render("byContent"));

    expect(visibleText(byUrl)).toBe("공식 발표");
    expect(visibleText(byContent)).toBe("공식 발표라고 함");
    // 같은 말이면 모델 판단이 주소 근거와 같은 확실성으로 보인다 — 그게 INV-O2 가 막는 것이다.
    expect(visibleText(byUrl)).not.toBe(visibleText(byContent));
  });

  it("INV-O2: 무엇을 근거로 한 판단인지 스크린리더에도 전한다", () => {
    // 형태(채움 vs 점선)로만 가르면 화면을 못 보는 사람에게는 두 표시가 같다.
    expect(officialMark(render("byUrl"))?.textContent).toContain("원문 주소");
    expect(officialMark(render("byContent"))?.textContent).toContain("AI");
  });

  it("INV-O2: 근거 문장에는 **실제 호스트**가 들어간다", () => {
    // 표시용 출처 이름을 쓰면 `blog.google` 이 "Blog 도메인입니다"로 읽힌다 —
    // 도메인도 발행처도 아닌 말이고, 이 문장이 근거의 전부인 사람에게는 근거가 사라진다.
    const html = renderToStaticMarkup(
      <ArticleCard
        article={item({
          officialBasis: "byUrl",
          sourceUrl: "https://blog.google/technology/ai/x",
          sourceName: "Blog",
        })}
        nowIso={NOW}
        isRead={false}
      />,
    );
    expect(officialMark(html)?.textContent).toContain("blog.google");
  });

  it("INV-O2 (CS9) 실패경로: none 이면 공식 표시가 붙지 않는다", () => {
    const html = render("none");
    expect(officialMark(html)).toBeNull();
    expect(html).not.toContain("공식");
  });
});
