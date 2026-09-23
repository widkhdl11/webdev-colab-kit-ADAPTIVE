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
    kinds: [],
    issueScore: 0,
    tags: [{ name: "모델", axis: "field" as const }],
    officialBasis: "none",
    gate: null,
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

  it("요약도 키워드도 없으면 원문이 메타 줄의 바로 다음 형제다 (.metaRow + .prose 가 성립)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ summary: "", summaryPoints: [], tags: [] })} nowIso={NOW} />,
    );
    // 요약 박스는 그리지 않는다 — 빈 박스가 더 나쁜 정보다
    expect(html).not.toContain("AI 요약");
    // 키워드 줄도 그리지 않는다 — 백필을 안 했으므로 옛 글은 빈 배열로 온다(2026-08-30).
    // 빈 div 를 그리면 이 선택자가 안 맞아 점선이 두 줄로 겹친다.
    expect(html).not.toContain(styles.keywords);
    // 사이에 무엇이든 끼면 여기서 깨진다 = CSS 선택자도 같이 깨졌다는 뜻
    expect(nextAfterMetaRow(html)?.className).toBe(styles.prose);
  });

  // 2026-08-31: 키워드 줄이 메타 줄 밖으로 나오면서 이 자리에 끼는 요소가 하나 늘었다
  // (승인 시안 badge-row.html `.detailKw` — 점선 아래 별도 줄).
  // 그래서 `.metaRow + .prose` 는 **키워드도 요약도 없을 때만** 성립한다. 키워드가 있으면
  // 두 점선이 인접하지 않으므로 `.prose` 는 자기 점선을 그대로 갖는 것이 맞다 —
  // 여기서 겹침 방지 규칙을 `.keywords + .prose` 로 넓히면 키워드 줄과 원문이 선 없이 붙는다.
  it("키워드가 있으면 그 줄이 메타 줄과 원문 사이에 끼고, 두 점선은 인접하지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({
          summary: "",
          summaryPoints: [],
          tags: [{ name: "모델", axis: "field" as const }],
        })}
        nowIso={NOW}
      />,
    );
    const next = nextAfterMetaRow(html);
    expect(next?.className).toBe(styles.keywords);
    expect(next?.nextElementSibling?.className).toBe(styles.prose);
  });

  it("요약이 있으면 키워드 줄 다음에 요약 박스가 들어간다 (구획선이 필요한 경우)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article()} nowIso={NOW} />,
    );
    expect(html).toContain("AI 요약");
    // 이때는 메타 줄 다음이 원문이 아니므로 선택자가 안 맞고, .prose 의 점선이 살아난다
    expect(nextAfterMetaRow(html)?.className).toBe(styles.keywords);
    expect(nextAfterMetaRow(html)?.nextElementSibling?.className).toBe(styles.aiSummary);
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
    // 키워드는 빈 배열로 준다 — 키워드 줄은 이 자리에 **의도적으로** 끼는 것이라
    // (2026-08-31 승인 시안) 여기 섞으면 병기 줄이 샜을 때와 구별이 안 된다.
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({
          title: "Anthropic ships X",
          titleKo: "앤트로픽이 X를 내놨다",
          summary: "",
          sourceExcerpt: null,
          tags: [],
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

/**
 * 상세 뱃지 — badge-keywords INV-KD1 뒷절 ("상세 화면에는 전부 보여준다").
 *
 * 카드 쪽 절반(4개 + `+N`)은 widgets/feed/ui/article-card.test.tsx 가 본다.
 * 한쪽만 보면 상한을 상세에도 걸어 버려도 그쪽이 통과한다 — 상세가 넓은 화면이라
 * 자르지 않는 것이 이 조항의 요점이다.
 */
describe("ArticleView — 상세 뱃지 (INV-KD1)", () => {
  const tags = [
    { name: "코딩", axis: "field" as const },
    { name: "보안", axis: "field" as const },
    { name: "로봇", axis: "field" as const },
    { name: "출시", axis: "kind" as const },
    { name: "소송", axis: "kind" as const },
  ];

  it("BK19: 붙을 수 있는 최대(5개)가 하나도 안 잘리고 전부 나온다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ tags })} nowIso={NOW} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const chips = [...doc.querySelectorAll(`[class*='${styles.tag}']`)];
    expect(chips).toHaveLength(5);
    // 접두사 앞뒤의 공백은 스크린리더가 알약을 붙여 읽지 않게 하는 것이다(sr-only) — 같이 벗긴다
    expect(chips.map((c) => c.textContent?.replace(/^\s*(분야|사건종류)\s*/, ""))).toEqual([
      "코딩",
      "보안",
      "로봇",
      "출시",
      "소송",
    ]);
  });

  it("BK19: 상세에는 `+N` 접기가 없다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ tags })} nowIso={NOW} />,
    );
    expect(html).not.toContain("개 더");
    expect(html).not.toMatch(/>\+\d/);
  });

  // 승인된 것은 개수만이 아니라 **자리**다 — 시안(badge-row.html `.detailKw`)은
  // 메타 줄의 점선 **아래** 별도 줄이다. 2026-08-31 이전 구현은 메타 줄 안 인라인이었고,
  // 개수·색 테스트는 그 상태에서도 전부 통과했다. 자리를 안 박으면 또 갈린다.
  it("BK19: 키워드 줄은 메타 줄 밖, 점선 아래 별도 줄이다 (승인 시안 2026-08-27)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ tags })} nowIso={NOW} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const row = doc.querySelector(`.${styles.keywords}`);
    expect(row).not.toBeNull();
    // 메타 줄 안으로 되돌리면 여기서 빨간불이 켜진다
    expect(row!.closest(`.${styles.metaRow}`)).toBeNull();
    expect(doc.querySelector(`.${styles.metaRow}`)?.nextElementSibling).toBe(row);
    // 줄이 메타에서 떨어져 나온 만큼, 이 알약 뭉치가 무엇의 목록인지는 라벨만 나른다
    expect(row!.getAttribute("role")).toBe("group");
    expect(row!.getAttribute("aria-label")).toBe("이 소식의 키워드");
    // 칩이 전부 이 줄 안에 있는지까지 본다 — 일부만 남겨둬도 위 단언들은 통과한다
    expect(row!.querySelectorAll(`[class*='${styles.tag}']`)).toHaveLength(tags.length);
  });

  it("BK19 실패경로: 키워드가 없으면 줄 자체를 안 그린다 (빈 여백만 남지 않게)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ tags: [] })} nowIso={NOW} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector(`.${styles.keywords}`)).toBeNull();
  });

  it("INV-B5: 상세에서도 두 축이 서로 다른 클래스를 받는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ tags })} nowIso={NOW} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const chips = [...doc.querySelectorAll(`[class*='${styles.tag}']`)];
    expect(chips[0].className).toMatch(/kwField/);
    expect(chips[4].className).toMatch(/kwKind/);
    expect(chips[0].className).not.toBe(chips[4].className);
  });
});

/**
 * 하단 이전/다음 (design-rules 2026-09-01 「상세 화면 하단 — 이전 글 / 다음 글」).
 * 자리·형태는 DOM 으로 본다 — 문자열 포함만 보면 순서가 뒤집혀도 통과한다.
 */
describe("ArticleView — 이전 글 / 다음 글", () => {
  const dom = (html: string) => {
    const root = new DOMParser().parseFromString(html, "text/html").body;
    return root;
  };
  const link = (title: string) => ({
    href: `/articles/${title}?tab=news`,
    title,
  });

  it("앞뒤 글의 제목과 주소를 그대로 그린다 — 원문 링크 줄 다음 자리다", () => {
    const root = dom(
      renderToStaticMarkup(
        <ArticleView
          article={article()}
          nowIso={NOW}
          nav={{ prev: link("앞글"), next: link("뒷글") }}
        />,
      ),
    );
    const nav = root.querySelector('nav[aria-label="글 이동"]');
    expect(nav).not.toBeNull();
    expect(nav?.previousElementSibling?.className).toContain(styles.foot);
    const anchors = [...(nav?.querySelectorAll("a") ?? [])];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "/articles/앞글?tab=news",
      "/articles/뒷글?tab=news",
    ]);
    expect(anchors.map((a) => a.textContent)).toEqual([
      "← 이전 글앞글",
      "다음 글 →뒷글",
    ]);
    // 모바일 고정 줄로 내려갈 표식 — body 가 이걸 보고 아래 자리를 비운다
    expect(nav?.hasAttribute("data-dock")).toBe(true);
  });

  it("끝에 닿아도 칸을 없애지 않는다 — 포커스를 받는 비활성 버튼으로 남는다", () => {
    const root = dom(
      renderToStaticMarkup(
        <ArticleView
          article={article()}
          nowIso={NOW}
          nav={{ prev: null, next: link("뒷글") }}
        />,
      ),
    );
    const first = root.querySelector(
      'nav[aria-label="글 이동"]',
    )?.firstElementChild;
    expect(first?.tagName).toBe("BUTTON");
    expect(first?.getAttribute("aria-disabled")).toBe("true");
    expect(first?.textContent).toContain("첫 글입니다");
  });

  it("마지막 글이면 다음 칸이 「마지막 글입니다」다", () => {
    const root = dom(
      renderToStaticMarkup(
        <ArticleView
          article={article()}
          nowIso={NOW}
          nav={{ prev: link("앞글"), next: null }}
        />,
      ),
    );
    const last = root.querySelector(
      'nav[aria-label="글 이동"]',
    )?.lastElementChild;
    expect(last?.tagName).toBe("BUTTON");
    expect(last?.textContent).toContain("마지막 글입니다");
  });

  it("이웃을 모르면(피드 목록 밖의 옛 글) 줄 자체를 안 그린다 — 「첫 글」이라 하면 거짓말이다", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article()} nowIso={NOW} nav={null} />,
    );
    expect(dom(html).querySelector('nav[aria-label="글 이동"]')).toBeNull();
  });

  it("「피드로」는 들어올 때의 피드 주소로 돌아간다", () => {
    const root = dom(
      renderToStaticMarkup(
        <ArticleView
          article={article()}
          nowIso={NOW}
          backHref="/?tab=news&days=3"
        />,
      ),
    );
    expect(root.querySelector(`a.${styles.back}`)?.getAttribute("href")).toBe(
      "/?tab=news&days=3",
    );
  });
});

/**
 * 요약 서식 (content-safety INV-D7). 해석기 단위 테스트만으로는 부족하다 — 화면이 해석기를
 * 안 부르거나 결과를 HTML 문자열로 밀어 넣어도 해석기 테스트는 green 이다. 그래서 상세
 * 렌더 결과를 DOM 으로 본다.
 */
describe("ArticleView — 요약 서식 (INV-D7)", () => {
  const box = (a: Article) => {
    const root = new DOMParser().parseFromString(renderToStaticMarkup(<ArticleView article={a} nowIso={NOW} />), "text/html").body;
    return root.querySelector(`.${styles.aiSummary}`) as HTMLElement;
  };

  it("INV-D7 (S14): AI 요약의 문단·굵게·목록·표가 요소로 그려진다", () => {
    const el = box(
      article({
        summary:
          "첫 문단 **핵심**.\n\n둘째 문단.\n\n- 항목 하나\n- 항목 둘\n\n| 모델 | 가격 |\n|---|---|\n| A | $3 |",
      }),
    );
    expect(el.querySelector("strong")?.textContent).toBe("핵심");
    expect(el.querySelectorAll("table thead th")).toHaveLength(2);
    // 첫 열은 행 머리칸이다 — 스크린리더가 그 행의 이름으로 읽는다
    const rowHead = el.querySelector("table tbody th");
    expect(rowHead?.textContent).toBe("A");
    expect(rowHead?.getAttribute("scope")).toBe("row");
    expect([...el.querySelectorAll("li")].map((li) => li.textContent)).toContain("항목 하나");
    expect(el.textContent).toContain("둘째 문단.");
  });

  it("INV-D7 (S15, 실패경로): 링크·이미지·제목·스크립트 요소가 하나도 생기지 않는다", () => {
    const el = box(
      article({
        summary:
          "[클릭](javascript:alert(1))\n\n![x](https://ex.com/a.png)\n\n# 제목\n\n<script>alert(1)</script>\n\nhttps://evil.example",
      }),
    );
    expect(el.querySelector("a, img, h1, h2, h3, h4, h5, h6, script")).toBeNull();
    // 표기는 글자 그대로 보인다 — 조용히 지우면 무엇이 들어왔는지 사람이 알 수 없다
    expect(el.textContent).toContain("[클릭](javascript:alert(1))");
    expect(el.textContent).toContain("<script>alert(1)</script>");
  });

  it("INV-D7 (S17, 실패경로): 출처가 준 요약글의 기호는 해석하지 않는다", () => {
    const el = box(article({ summary: "", sourceExcerpt: "출처 글 **굵게** 표기" }));
    expect(el.querySelector("strong")).toBeNull();
    expect(el.textContent).toContain("출처 글 **굵게** 표기");
  });
});

/**
 * 요약 상자 순서 — B안 + 한 문장 요약 (2026-09-23 사용자 결정).
 * 한 문장 → 「핵심」 목록 → 나머지 문단 → 표. 자리를 DOM 순서로 본다.
 */
describe("ArticleView — 요약 상자 순서 (B안 + 한 문장)", () => {
  const kids = (a: Article) => {
    const root = new DOMParser().parseFromString(renderToStaticMarkup(<ArticleView article={a} nowIso={NOW} />), "text/html").body;
    const box = root.querySelector(`.${styles.aiSummary}`) as HTMLElement;
    return [...box.children];
  };

  it("한 문장 → 핵심 목록 → 문단 → 표 → 안내 순이다", () => {
    const order = kids(
      article({
        summary: "미스트랄이 모델 세 개를 내놓았다.\n\n가격이 내려갔다.\n\n| 모델 | 가격 |\n|---|---|\n| S | $0.1 |",
        summaryPoints: ["세 개 공개", "가격 인하"],
      }),
    ).map((el) => (el.tagName === "P" ? `P:${el.textContent}` : el.tagName));
    expect(order).toEqual([
      "SPAN", // 「AI 요약」 라벨
      "P:미스트랄이 모델 세 개를 내놓았다.",
      "SPAN", // 「핵심」 라벨
      "UL",
      "P:가격이 내려갔다.",
      "TABLE",
      "P:요약은 자동으로 생성됩니다. 사실 확인이 필요하면 아래 원문을 읽어주세요.",
    ]);
  });

  it("한 문장에는 앞세움 모양이 붙고 핵심 목록에도 제 모양이 붙는다", () => {
    const el = kids(article({ summary: "한 문장.\n\n둘째.", summaryPoints: ["항목"] }));
    expect(el[1].className).toContain(styles.summaryLead);
    expect(el[3].className).toContain(styles.summaryPoints);
  });

  it("핵심 항목이 없으면 「핵심」 라벨도 없다", () => {
    const el = kids(article({ summary: "한 문장.\n\n둘째.", summaryPoints: [] }));
    expect(el.some((e) => e.textContent === "핵심")).toBe(false);
  });

  it("실패경로: 출처가 준 요약글은 순서를 바꾸지 않고 한 문단 그대로다", () => {
    const el = kids(article({ summary: "", sourceExcerpt: "출처 글.\n\n둘째 줄", summaryPoints: ["무시"] }));
    expect(el.filter((e) => e.tagName === "UL")).toHaveLength(0);
    expect(el[1].className).not.toContain(styles.summaryLead);
  });
});
