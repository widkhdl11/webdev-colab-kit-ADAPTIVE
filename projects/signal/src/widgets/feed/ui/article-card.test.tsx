import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GATE_ONE } from "@/entities/article";
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

/**
 * 카드 뱃지 — badge-keywords INV-KD1 (2026-08-31 에 planned 에서 옮겨 온 조항).
 *
 * 상한을 **리터럴 5개 입력**으로 본다. `MAX_VISIBLE_TAGS` 를 써서 입력을 만들면 그 상수를
 * 못 붙든다 — 2026-08-30 `BADGE_LIMIT` 에서 실제로 그렇게 깨졌다(rules/tdd.md).
 */
const field = (name: string) => ({ name, axis: "field" as const });
const kind = (name: string) => ({ name, axis: "kind" as const });

/** 카드의 뱃지 칩들. 순서는 마크업 순서 그대로라 마지막이 `+N` 이다. */
function cardChips(html: string): Element[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("[class*='cardKwChip']")];
}

const cardHtml = (tags: ArticleListItem["tags"]) =>
  renderToStaticMarkup(<ArticleCard article={item({ tags })} nowIso={NOW} isRead={false} />);

describe("ArticleCard — 카드 뱃지 (INV-KD1)", () => {
  it("BK18: 5개가 붙으면 4개만 보이고 나머지는 `+N` 으로 접힌다", () => {
    const chips = cardChips(
      cardHtml([field("코딩"), field("보안"), field("로봇"), kind("출시"), kind("소송")]),
    );
    // 칩 5개 = 보이는 뱃지 4 + `+N` 하나. 상한을 5로 올리면 6개가 되어 깨진다.
    expect(chips).toHaveLength(5);
    expect(visibleText(chips[4])).toBe("+1");
  });

  it("BK18: 접힌 이름을 조용히 버리지 않는다 — 말로 남긴다", () => {
    const chips = cardChips(
      cardHtml([field("코딩"), field("보안"), field("로봇"), kind("출시"), kind("소송")]),
    );
    // 붙어 있는데 화면·소리 어디에도 없으면 카드가 거짓말을 한다.
    expect(chips[4].textContent).toContain("소송");
  });

  it("BK18: `+N` 은 축 색을 안 쓴다 — 두 축에 걸쳐 있어 어느 쪽이라고 말할 수 없다", () => {
    const chips = cardChips(
      cardHtml([field("코딩"), field("보안"), field("로봇"), kind("출시"), kind("소송")]),
    );
    expect(chips[4].className).not.toMatch(/kwField|kwKind/);
    // 보이는 쪽은 반대로 축 색을 **쓴다** — 안 그러면 이 단언이 "클래스가 아예 없다"로도 통과한다.
    expect(chips[0].className).toMatch(/kwField/);
    expect(chips[3].className).toMatch(/kwKind/);
  });

  it("INV-KD1 실패경로: 4개 이하면 `+N` 자체가 안 붙는다", () => {
    const chips = cardChips(cardHtml([field("코딩"), field("보안"), kind("출시")]));
    expect(chips).toHaveLength(3);
    expect(cardHtml([field("코딩")])).not.toContain("개 더");
  });

  it("INV-KD1: 뱃지는 메타 줄이 아니라 별도 줄에 있다", () => {
    // 메타 줄에 두면 출처 이름이 잘린다(2026-08-11 폭 실측). 조항이 지목한 사고가 그것이다.
    const doc = new DOMParser().parseFromString(
      cardHtml([field("코딩"), kind("출시")]),
      "text/html",
    );
    const chip = doc.querySelector("[class*='cardKwChip']");
    const foot = doc.querySelector("[class*='cardFoot']");
    expect(chip).not.toBeNull();
    expect(foot).not.toBeNull();
    expect(foot?.contains(chip!)).toBe(false);
  });

  it("INV-N5: 카드 뱃지에는 숫자를 안 붙인다 — 건수는 줄 전체의 집계값이다", () => {
    const chips = cardChips(cardHtml([field("코딩"), kind("출시")]));
    for (const chip of chips) {
      expect(visibleText(chip)).not.toMatch(/\d/);
    }
  });
});

describe("핫이슈 뱃지 — hot-issue.md INV-H1", () => {
  const html = (gate: ArticleListItem["gate"]) =>
    renderToStaticMarkup(
      <ArticleCard article={item({ gate })} nowIso={NOW} isRead={false} />,
    );

  it("INV-H1: 1번 문에 배정된 글에는 핫이슈 뱃지가 붙는다", () => {
    expect(html(GATE_ONE)).toContain("핫이슈");
  });

  it("INV-H1 실패경로: 문 값이 없으면 안 붙는다 — 판정을 못 받았거나 문턱을 못 넘었다", () => {
    // 부재만 확인하면 절반이다. 위의 「붙는다」와 짝이라야 뱃지 줄을 지웠을 때 빨간불이 난다.
    expect(html(null)).not.toContain("핫이슈");
  });

  it("INV-H1: 뱃지 기준은 점수가 아니다 — 그날 상위여도 문 값이 없으면 안 붙는다", () => {
    // 2026-09-21 이전에는 이 자리가 `isTrending`(그날 점수 상위 3)이었다.
    // 그 값으로 되돌리면 이 검사가 잡는다.
    const topByScore = renderToStaticMarkup(
      <ArticleCard
        article={item({ gate: null, isTrending: true, score: 99 })}
        nowIso={NOW}
        isRead={false}
      />,
    );
    expect(topByScore).not.toContain("핫이슈");
  });
});

describe("ArticleCard — 요약 미리보기에 서식 기호가 안 찍힌다 (INV-D7)", () => {
  it("INV-D7: AI 요약은 기호를 벗긴 첫 문단만 보인다", () => {
    const html = renderToStaticMarkup(
      <ArticleCard
        article={item({ summary: "| a | b |\n|---|---|\n| 1 | 2 |\n\n가격은 **100만 원**이다.\n\n둘째" })}
        nowIso={NOW}
        isRead={false}
      />,
    );
    expect(html).toContain("가격은 100만 원이다.");
    expect(html).not.toContain("**");
    expect(html).not.toContain("| a |");
    expect(html).not.toContain("둘째");
  });

  it("INV-D7 실패경로: 출처가 준 요약글은 손대지 않는다", () => {
    const html = renderToStaticMarkup(
      <ArticleCard
        article={item({ summary: "", sourceExcerpt: "출처 **그대로**" })}
        nowIso={NOW}
        isRead={false}
      />,
    );
    expect(html).toContain("출처 **그대로**");
  });
});
