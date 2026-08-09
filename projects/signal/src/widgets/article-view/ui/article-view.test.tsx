import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Article } from "@/entities/article";
import { ArticleView } from "./article-view";
import styles from "./article-view.module.css";

// content-safety.md S8 은 "When **상세 렌더**" 다 — 가드 함수만 검증하면 스펙이 아니라
// 함수를 검증한 것이 된다. INV-D6 이 메우려던 빈칸이 정확히 "가드는 있는데 필드에 안 닿아
// 있었다" 였으므로, 배선을 지웠을 때 빨간불이 켜지는 테스트가 여기 있어야 한다.

const NOW = "2026-08-05T01:00:00.000Z";

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "a",
    title: "제목",
    summary: "요약",
    summaryPoints: [],
    contentHtml: "<p>본문</p>",
    sourceName: "테스트 출처",
    sourceUrl: "https://example.com/a",
    publishedAt: "2026-08-05T00:00:00.000Z",
    tags: ["모델"],
    score: 10,
    isTrending: false,
    ...overrides,
  };
}

describe("ArticleView — 출처 링크 (INV-D6 배선)", () => {
  it("INV-D6: 정상 출처는 링크로 렌더되고 rel 이 붙는다(INV-D4)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article()} nowIso={NOW} />,
    );
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toMatch(/rel="noopener noreferrer"/);
    expect(html).toContain("출처에서 원문 보기");
  });

  it("INV-D6(실패경로, S8): javascript: 출처는 링크 자체가 렌더되지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ sourceUrl: "javascript:alert(1)" })}
        nowIso={NOW}
      />,
    );
    expect(html).not.toMatch(/javascript:/i);
    // href 만 비우고 버튼을 남기면 눌러도 아무 일 없는 버튼이 된다 — 요소째 없어야 한다
    expect(html).not.toContain("출처에서 원문 보기");
  });

  it("INV-D6(실패경로, S9): 제어문자로 위장한 스킴도 링크가 되지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ sourceUrl: "java\tscript:alert(1)" })}
        nowIso={NOW}
      />,
    );
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain("출처에서 원문 보기");
  });

  it("발행시각을 못 읽으면 메타 줄에 매달린 가운뎃점을 남기지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ publishedAt: "" })} nowIso={NOW} />,
    );
    expect(html).toContain("테스트 출처");
    expect(html).not.toMatch(/테스트 출처<\/strong>\s*·/);
  });
});

// design-rules 2026-08-08: 원문 시작에 점선 구획선을 그었는데, AI 요약 박스가 조건부라
// 요약이 없으면 그 선이 메타 줄의 밑선 바로 아래에 붙어 두 줄로 겹친다.
// CSS 쪽은 `.metaRow + .prose { border-top: 0 }` 로 막았고 — 그 규칙은 **두 요소가 인접 형제라는
// DOM 사실에 통째로 얹혀 있다.** 사이에 뭔가 하나 끼는 순간 선택자가 조용히 안 맞고 점선이 둘 된다.
// CSS 는 여기서 못 재므로(jsdom 에 모듈 CSS 가 안 붙는다) **그 전제를 DOM 으로 굳힌다.**
describe("ArticleView — 요약 유무에 따른 구획선 전제 (design-rules 2026-08-08)", () => {
  // 문자열 매칭(`/<\/div><article/`)으로는 이걸 못 잡는다 — 사이에 <div/> 하나를 끼워도
  // 그 div 의 닫는 태그가 패턴을 만족시켜 통과한다. 실제 형제 관계를 봐야 한다.
  function nextAfterMetaRow(html: string): Element | null {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const meta = doc.querySelector(`.${styles.metaRow}`);
    expect(meta).not.toBeNull();
    return meta!.nextElementSibling;
  }

  it("요약이 없으면 원문이 메타 줄의 바로 다음 형제다 (.metaRow + .prose 가 성립)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ summary: "", summaryPoints: [] })} nowIso={NOW} />,
    );
    // 요약 박스는 그리지 않는다 — 빈 박스가 더 나쁜 정보다
    expect(html).not.toContain("AI 요약");
    // 사이에 무엇이든 끼면 여기서 깨진다 = CSS 선택자도 같이 깨졌다는 뜻
    expect(nextAfterMetaRow(html)?.className).toBe(styles.prose);
  });

  it("요약이 있으면 그 사이에 요약 박스가 들어간다 (구획선이 필요한 경우)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article()} nowIso={NOW} />,
    );
    expect(html).toContain("AI 요약");
    // 이때는 메타 줄 다음이 원문이 아니므로 선택자가 안 맞고, .prose 의 점선이 살아난다
    expect(nextAfterMetaRow(html)?.className).toBe(styles.aiSummary);
  });
});
