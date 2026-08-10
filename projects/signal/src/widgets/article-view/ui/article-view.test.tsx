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
    titleKo: null,
    summary: "요약",
    sourceExcerpt: null,
    summaryPoints: [],
    contentHtml: "<p>본문</p>",
    sourceId: "test-source",
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

describe("ArticleView — INV-S1 요약과 무관하게 원문·출처를 항상 준다", () => {
  it("INV-S1 (S12): 요약이 있어도 원문 본문과 출처 링크가 함께 있다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ summary: "요약문", summaryPoints: ["항목"] })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("요약문");
    expect(html).toContain("본문"); // contentHtml
    expect(html).toContain('href="https://example.com/a"');
  });

  it("INV-S1 (S12) 실패경로: 요약이 없어도 원문과 출처는 그대로 나온다", () => {
    // 요약은 표시용 파생 정보다. 정확성의 근거는 언제나 원문과 출처 링크다 —
    // 요약 유무가 원문 렌더를 좌우하면 요약 실패가 곧 "읽을 수 없는 글"이 된다.
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ summary: "", summaryPoints: [] })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("본문");
    expect(html).toContain('href="https://example.com/a"');
  });

  it("INV-S1: 요약이 원문을 대체하지 않는다 — 원문 영역이 조건부가 아니다", () => {
    // 변이 확인용: 원문 렌더를 요약 유무에 매달면 둘 중 하나가 반드시 깨진다.
    for (const summary of ["요약문", ""]) {
      const html = renderToStaticMarkup(
        <ArticleView article={article({ summary, summaryPoints: [] })} nowIso={NOW} />,
      );
      expect(html).toContain("출처에서 가져온 원문입니다");
    }
  });
});

describe("ArticleView — 원문을 안 주는 출처", () => {
  it("본문이 비면 '아래는 원문입니다'를 띄우지 않는다", () => {
    // 2026-08-09 실제 수집에서 나온 상태 — HN·OpenAI 피드 둘 다 본문을 안 준다.
    // 안내만 남고 아래가 비어 있으면 화면이 거짓말을 한다.
    const html = renderToStaticMarkup(
      <ArticleView article={article({ contentHtml: "" })} nowIso={NOW} />,
    );
    expect(html).not.toContain("아래는 출처에서 가져온 원문입니다");
    expect(html).toContain("원문 전문을 제공하지 않습니다");
  });

  it("공백뿐인 본문도 없는 것으로 본다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ contentHtml: "   \n  " })} nowIso={NOW} />,
    );
    expect(html).toContain("원문 전문을 제공하지 않습니다");
  });

  it("INV-S1: 본문이 없어도 출처 링크는 그대로 있다", () => {
    // 원문이 없을수록 출처 링크가 유일한 경로다.
    const html = renderToStaticMarkup(
      <ArticleView article={article({ contentHtml: "" })} nowIso={NOW} />,
    );
    expect(html).toContain('href="https://example.com/a"');
  });
});

describe("ArticleView — INV-S2 요약 대체 표시", () => {
  it("INV-S2 (S19): AI 요약이 없으면 출처 요약글을 보여준다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ summary: "", sourceExcerpt: "출처가 준 소개글이다." })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("출처가 준 소개글이다.");
  });

  it("INV-S2 (S19): 그때 'AI 요약'이라고 부르지 않는다", () => {
    // 라벨이 값과 어긋나면 화면이 거짓말을 한다.
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ summary: "", sourceExcerpt: "출처가 준 소개글이다." })}
        nowIso={NOW}
      />,
    );
    expect(html).not.toContain("AI 요약");
    expect(html).toContain("출처가 준 요약");
  });

  it("INV-S2: AI 요약이 있으면 그것을 쓰고 AI 라고 알린다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ summary: "AI 가 만든 요약", sourceExcerpt: "출처 글" })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("AI 요약");
    expect(html).toContain("AI 가 만든 요약");
    expect(html).not.toContain("출처 글");
  });

  it("INV-S2 실패경로: 둘 다 없으면 요약 박스를 그리지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ summary: "", sourceExcerpt: null })} nowIso={NOW} />,
    );
    expect(html).not.toContain("AI 요약");
    expect(html).not.toContain("출처가 준 요약");
  });
});

describe("ArticleView — 제목 (INV-S6) · 핵심 항목 (INV-S7)", () => {
  it("INV-S6 (S23): 번역 제목을 보여주고 원문 제목을 함께 남긴다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ title: "Anthropic ships X", titleKo: "앤트로픽이 X를 내놨다" })}
        nowIso={NOW}
      />,
    );
    // "html 어딘가에 있다"로는 부족하다 — h1 에 영어, 아래 줄에 번역문이 가도 통과한다.
    // INV-S6 이 요구하는 건 "번역문을 보여주고 원문을 **함께**"라 자리를 고정해야 한다.
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("h1")?.textContent).toBe("앤트로픽이 X를 내놨다");

    const orig = doc.querySelector(`.${styles.originalTitle}`);
    expect(orig?.textContent).toContain("Anthropic ships X");
    expect(orig?.textContent).toContain("원문 제목");
    // 원문 줄에 번역문이 섞여 있으면 위아래가 뒤바뀐 것이다.
    expect(orig?.textContent).not.toContain("앤트로픽이");
  });

  it("INV-S6: 원문 제목은 메타 줄 안에 있다 (design-rules 2026-08-10 승인)", () => {
    // 자리를 고정하지 않으면 "어딘가에 있다"만 검증하게 된다. 승인된 것은 **자리**다 —
    // 제목 바로 밑이 아니라 출처·시각과 같은 묶음. 밖으로 되돌리면 여기서 빨간불이 켜진다.
    // 이 줄은 메타 줄의 자식이므로 `.metaRow + .prose`(요약 없을 때 점선 겹침 방지)는
    // 번역 유무와 무관하게 그대로 성립한다 — 아래 테스트가 그걸 따로 붙든다.
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ title: "Anthropic ships X", titleKo: "앤트로픽이 X를 내놨다" })}
        nowIso={NOW}
      />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const orig = doc.querySelector(`.${styles.originalTitle}`);
    expect(orig).not.toBeNull();
    expect(orig!.parentElement?.className).toBe(styles.metaRow);
  });

  it("번역이 있어도 요약 없는 화면의 점선 전제가 유지된다", () => {
    // 병기 줄을 메타 줄 밖에 두면 이 조합에서 .metaRow 다음 형제가 그 줄이 되어
    // `.metaRow + .prose` 가 안 맞고 점선이 두 줄로 겹친다(design-rules 2026-08-08).
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({
          title: "Anthropic ships X",
          titleKo: "앤트로픽이 X를 내놨다",
          summary: "",
          sourceExcerpt: null,
        })}
        nowIso={NOW}
      />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector(`.${styles.metaRow}`)?.nextElementSibling?.className).toBe(
      styles.prose,
    );
  });

  it("INV-S6 실패경로: 번역이 없으면 원문 제목만 보여준다(같은 문장을 두 번 쓰지 않는다)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ title: "Only English", titleKo: null })} nowIso={NOW} />,
    );
    expect(html).toContain("Only English");
    expect(html).not.toContain("원문 제목");
  });

  it("INV-S7: AI 요약이면 핵심 항목을 렌더한다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ summary: "AI 요약문", summaryPoints: ["첫째 항목", "둘째 항목"] })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("첫째 항목");
    expect(html).toContain("둘째 항목");
  });

  it("INV-S7 (S26) 실패경로: 출처 글을 보여줄 때는 핵심 항목을 렌더하지 않는다", () => {
    // 요약만 지워지고 summary_points 가 남은 항목이 실제로 있다(마이그레이션 0003).
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({
          summary: "",
          sourceExcerpt: "출처가 준 글",
          summaryPoints: ["남아 있는 항목"],
        })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("출처가 준 요약");
    expect(html).not.toContain("남아 있는 항목");
  });
});
