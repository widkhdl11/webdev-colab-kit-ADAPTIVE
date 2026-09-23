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

/**
 * 원문 보기 — 기본 접힘 (design-rules 2026-09-23 「상세 화면 재구성」). 원문이 요약보다 크게 전면에
 * 서지 않게 접고, 펼치기 라벨에 원문의 언어·성격(소스 설정)을 적는다.
 */
describe("ArticleView — 원문 보기 (접힘)", () => {
  const doc = (a: Article) =>
    new DOMParser().parseFromString(renderToStaticMarkup(<ArticleView article={a} nowIso={NOW} />), "text/html");

  it("원문은 details 안에 있고 기본으로 접혀 있다", () => {
    const d = doc(article()).querySelector("details");
    expect(d).not.toBeNull();
    expect(d?.hasAttribute("open")).toBe(false);
    expect(d?.querySelector(`.${styles.prose}`)?.textContent).toContain("본문");
  });

  it("펼치기 라벨에 원문의 언어가 들어간다 — 영어 소스", () => {
    const summary = doc(article({ sourceId: "openai-blog" })).querySelector("details > summary");
    expect(summary?.textContent).toContain("원문 보기");
    expect(summary?.textContent).toContain("(영어)");
  });

  it("펼치기 라벨에 원문의 성격이 들어간다 — Hada 정리", () => {
    const summary = doc(article({ sourceId: "geeknews" })).querySelector("details > summary");
    expect(summary?.textContent).toContain("(Hada 정리, 한국어)");
  });

  it("실패경로: 설정에 없는 소스면 괄호를 지어내지 않는다", () => {
    expect(doc(article()).querySelector("details > summary")?.textContent).not.toContain("(");
  });

  it("실패경로: 원문이 없으면 펼칠 상자를 만들지 않고 안내 한 줄만 둔다", () => {
    const d = doc(article({ contentHtml: "" }));
    expect(d.querySelector("details")).toBeNull();
    expect(d.body.textContent).toContain("원문 전문을 제공하지 않습니다");
  });

  it("출처 표시명은 소스 설정을 쓴다 — 피드가 준 `Openai` 가 아니다", () => {
    const who = doc(article({ sourceId: "openai-blog", sourceName: "Openai" })).querySelector(`.${styles.who} strong`);
    expect(who?.textContent).toBe("OpenAI");
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
    // 「AI 요약」 상자는 없앴다(design-rules 2026-09-23) — AI 가 만든 글이라는 표시는 안내 문구가 나른다.
    expect(html).toContain("요약은 자동으로 만들어집니다");
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
    expect(orig?.textContent).toContain("원문:");
    // 원문 줄에 번역문이 섞여 있으면 위아래가 뒤바뀐 것이다.
    expect(orig?.textContent).not.toContain("앤트로픽이");
  });

  it("INV-S6: 원문 제목은 메타 줄 안에 있다 (design-rules 2026-08-10 승인)", () => {
    // 자리를 고정하지 않으면 "어딘가에 있다"만 검증하게 된다. 승인된 것은 **자리**다 —
    // 제목 바로 밑이 아니라 출처·시각과 같은 묶음. 밖으로 되돌리면 여기서 빨간불이 켜진다.
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

  it("INV-S6 실패경로: 번역이 없으면 원문 제목만 보여준다(같은 문장을 두 번 쓰지 않는다)", () => {
    const html = renderToStaticMarkup(
      <ArticleView article={article({ title: "Only English", titleKo: null })} nowIso={NOW} />,
    );
    expect(html).toContain("Only English");
    expect(html).not.toContain("원문:");
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

  // 2026-09-23 상세 화면 재구성으로 상세의 키워드는 알약이 아니라 **메타 줄 안의 글자**다
  // (알약은 눌리지 않는데 눌릴 것처럼 보였다). 개수 조항(전부 보인다)은 그대로다.
  const meta = (a: Article) =>
    new DOMParser()
      .parseFromString(renderToStaticMarkup(<ArticleView article={a} nowIso={NOW} />), "text/html")
      .querySelector(`.${styles.who}`);

  it("BK19: 붙을 수 있는 최대(5개)가 하나도 안 잘리고 메타 줄에 전부 나온다", () => {
    const text = meta(article({ tags }))?.textContent ?? "";
    for (const t of tags) expect(text).toContain(t.name);
  });

  it("BK19: 상세에는 `+N` 접기가 없다", () => {
    const html = renderToStaticMarkup(<ArticleView article={article({ tags })} nowIso={NOW} />);
    expect(html).not.toContain("개 더");
    expect(html).not.toMatch(/>\+\d/);
  });

  it("분야를 먼저, 사건종류를 다음에 쓴다 — 색 대신 순서와 읽기 접두사가 축을 나른다", () => {
    const mixed = [tags[3], tags[0], tags[4], tags[1]]; // 출시 · 코딩 · 소송 · 보안
    const text = (meta(article({ tags: mixed }))?.textContent ?? "").replace(/\s+/g, " ");
    expect(text.indexOf("코딩")).toBeLessThan(text.indexOf("출시"));
    expect(text.indexOf("보안")).toBeLessThan(text.indexOf("출시"));
    expect(text).toContain("분야 코딩");
    expect(text).toContain("사건종류 출시");
  });

  it("실패경로: 키워드가 없으면 매달린 가운뎃점이 없다", () => {
    const text = meta(article({ tags: [], publishedAt: "" }))?.textContent ?? "";
    expect(text.trim().endsWith("·")).toBe(false);
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
 * 요약 칸 (content-safety INV-D7 · ingestion-ranking INV-S8). 해석기가 없으므로 "칸이 칸대로 그려지는가"와
 * "칸 안의 기호가 요소가 되지 않는가"를 상세 렌더 결과(DOM)로 본다.
 */
describe("ArticleView — 요약 칸 (INV-D7 · INV-S8)", () => {
  const box = (a: Article) => {
    const root = new DOMParser().parseFromString(
      renderToStaticMarkup(<ArticleView article={a} nowIso={NOW} />),
      "text/html",
    ).body;
    return root.querySelector('section[aria-labelledby="summary-heading"]') as HTMLElement;
  };
  const NEW = {
    summary: "미스트랄이 모델 세 개를 내놓았다.",
    oneLine: "미스트랄이 모델 세 개를 내놓았다.",
    summaryPoints: ["세 모델이 한 번에 나왔다.", "작은 모델 가격이 내렸다.", "도구 호출은 아직 안 된다."],
    summaryTable: { head: ["모델", "가격"], rows: [["S", "$0.1"]] },
  };

  it("INV-D7 (S14): 「핵심」 절은 제목 → 번호 셋 → 표 → 안내 순이다", () => {
    const order = [...box(article(NEW)).children].map((el) => el.tagName);
    expect(order).toEqual(["H2", "OL", "TABLE", "P"]);
    expect(box(article(NEW)).querySelectorAll("ol > li")).toHaveLength(3);
  });

  it("INV-S8: 한 줄 요약은 제목 바로 아래, 메타 줄보다 위에 선다", () => {
    const d = new DOMParser().parseFromString(
      renderToStaticMarkup(<ArticleView article={article(NEW)} nowIso={NOW} />),
      "text/html",
    );
    const h1 = d.querySelector("h1");
    expect(h1?.nextElementSibling?.className).toBe(styles.leadLine);
    expect(h1?.nextElementSibling?.textContent).toBe(NEW.oneLine);
    expect(h1?.nextElementSibling?.nextElementSibling?.className).toBe(styles.metaRow);
  });

  it("INV-D7 (S14): 표의 첫 열은 행 머리칸이다", () => {
    const head = box(article(NEW)).querySelector("table tbody th");
    expect(head?.textContent).toBe("S");
    expect(head?.getAttribute("scope")).toBe("row");
  });

  it("INV-D7 (S15, 실패경로): 칸 안의 기호는 요소가 되지 않고 글자 그대로 보인다", () => {
    const hostile = "[클릭](javascript:alert(1)) **굵게** <script>alert(1)</script>";
    const el = box(
      article({
        ...NEW,
        oneLine: hostile,
        summaryPoints: ["![x](https://ex.com/a.png)", "# 제목", "https://evil.example"],
        summaryTable: { head: ["**a**", "b"], rows: [["[x](y)", "c"]] },
      }),
    );
    expect(el.querySelector("a, img, h1, h3, h4, h5, h6, script, strong")).toBeNull();
    // 한 줄 요약은 이 절 밖(제목 아래)에 선다 — 거기서도 글자로만 나오는지 본다
    const whole = new DOMParser().parseFromString(
      renderToStaticMarkup(<ArticleView article={article({ ...NEW, oneLine: hostile })} nowIso={NOW} />),
      "text/html",
    );
    expect(whole.querySelector(`.${styles.leadLine}`)?.textContent).toBe(hostile);
    expect(whole.querySelector(`.${styles.leadLine} *`)).toBeNull();
    expect(el.textContent).toContain("![x](https://ex.com/a.png)");
    expect(el.textContent).toContain("**a**");
  });

  it("INV-S8 (옛 요약 호환): 핵심은 번호 목록, 옛 문단은 접혀 있다 — 한 줄 요약은 없다", () => {
    const el = box(article({ summary: "옛 요약 문단이다.", oneLine: null, summaryPoints: ["항목"] }));
    expect(el.querySelectorAll("ol > li")).toHaveLength(1);
    const folded = el.querySelector("details");
    expect(folded?.hasAttribute("open")).toBe(false);
    expect(folded?.textContent).toContain("옛 요약 문단이다.");
  });

  it("INV-S8 (옛 요약 호환): 핵심도 없는 옛 요약은 문단을 펼친 채로 둔다 — 유일한 요약이다", () => {
    const el = box(article({ summary: "옛 요약 문단이다.", oneLine: null, summaryPoints: [] }));
    expect(el.querySelector("details")).toBeNull();
    expect(el.textContent).toContain("옛 요약 문단이다.");
  });

  it("INV-D7 (S17, 실패경로): 출처가 준 요약글은 문단 하나 그대로이고 목록·표가 없다", () => {
    const el = box(article({ summary: "", sourceExcerpt: "출처 **글**", summaryPoints: ["무시"], summaryTable: NEW.summaryTable }));
    expect(el.querySelector("ol, ul, table, strong")).toBeNull();
    expect(el.textContent).toContain("출처 **글**");
  });

  it("「핵심」 절 제목이 절의 이름이다", () => {
    expect(box(article(NEW)).querySelector("h2")?.textContent).toBe("핵심");
  });
});

/**
 * signal 포인트 (hot-issue INV-G2 · design-rules 2026-09-23 화면 어휘).
 */
describe("ArticleView — signal 포인트", () => {
  const d = (a: Article) =>
    new DOMParser().parseFromString(renderToStaticMarkup(<ArticleView article={a} nowIso={NOW} />), "text/html");

  it("INV-G2: 참인 질문마다 화면 라벨 + 근거 한 줄", () => {
    const doc = d(
      article({
        signalPoints: [
          { key: "변화", reason: "API 비용이 크게 줄어든다." },
          { key: "기회", reason: "패치 전까지가 위험하다." },
        ],
      }),
    );
    const section = doc.querySelector('section[aria-labelledby="signal-points-heading"]');
    expect(section?.querySelector("h2")?.textContent).toBe("signal 포인트");
    const rows = [...(section?.querySelectorAll("li") ?? [])].map((li) => li.textContent);
    expect(rows).toEqual(["실무 영향API 비용이 크게 줄어든다.", "시한 있음패치 전까지가 위험하다."]);
  });

  it("화면 라벨은 넷 밖의 말을 쓰지 않는다 — 판정 질문 원문이 화면에 나오지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        article={article({ signalPoints: [{ key: "변화", reason: null }, { key: "방향", reason: null }, { key: "기회", reason: null }] })}
        nowIso={NOW}
      />,
    );
    expect(html).toContain("실무 영향");
    expect(html).toContain("흐름 변화");
    expect(html).toContain("시한 있음");
    expect(html).not.toContain("사용자가 쓰는 것에 변화가 있나");
    expect(html).not.toContain("기회가 닫히나");
  });

  it("INV-G2 (S31d): 근거가 없으면 라벨만 선다", () => {
    const li = d(article({ signalPoints: [{ key: "변화", reason: null }] })).querySelector(
      'section[aria-labelledby="signal-points-heading"] li',
    );
    expect(li?.textContent).toBe("실무 영향");
  });

  it("INV-G2 실패경로: 판정이 없으면 절이 통째로 없다 — 「해당 없음」이라고 쓰지 않는다", () => {
    const html = renderToStaticMarkup(<ArticleView article={article({ signalPoints: [] })} nowIso={NOW} />);
    expect(html).not.toContain("signal-points-heading");
    expect(html).not.toContain("해당 없음");
  });
});
