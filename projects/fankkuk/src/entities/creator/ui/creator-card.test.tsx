import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NO_CARD_LOOK } from "../model/card-look";
import { CreatorCardHead, CreatorCardLine } from "./creator-card-head";
import { CreatorCardTags, fitChipCount } from "./creator-card-tags";

// 크리에이터 카드 C안(DECISIONS 2026-10-17 카드 d103) — 값이 없어도 줄 자리가 남고, 넘치는 칩은 「+N」.

function dom(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body;
}

describe("칩 줄에 들어가는 칩 수", () => {
  it("다 들어가면 전부 — 「+N」 자리를 남기지 않는다", () => {
    // 50 + 6 + 50 = 106
    expect(fitChipCount([50, 50], 30, 106, 6)).toEqual({ count: 2, squeeze: false });
  });

  it("넘치면 「+N」 자리를 남기고 앞에서부터 들어가는 만큼", () => {
    // 칩 셋 = 50+6+50+6+50 = 162 > 120. 「+N」 30 + 6 + 50 = 86, + 6 + 50 = 142 > 120 → 1개
    expect(fitChipCount([50, 50, 50], 30, 120, 6)).toEqual({ count: 1, squeeze: false });
  });

  it("첫 칩부터 안 들어가면 「+N」만 남기지 않고 첫 칩 하나를 줄여서(말줄임) 보인다", () => {
    expect(fitChipCount([200, 40], 30, 100, 6)).toEqual({ count: 1, squeeze: true });
  });

  it("칩 하나가 줄보다 넓으면 「+1」이 아니라 그 칩 하나를 줄여서 보인다", () => {
    expect(fitChipCount([200], 30, 100, 6)).toEqual({ count: 1, squeeze: true });
  });

  it("칩이 없으면 0개", () => {
    expect(fitChipCount([], 30, 100, 6)).toEqual({ count: 0, squeeze: false });
  });
});

describe("크리에이터 카드 — 줄 자리 고정", () => {
  const head = (fanName: string | null) =>
    dom(
      renderToStaticMarkup(
        <CreatorCardHead
          creatorId="00000000-0000-4000-b000-000000000001"
          name="새벽달빛라디오하루별이야하루별이달빛방송"
          href="/c/dawn"
          look={{ ...NO_CARD_LOOK, fanName }}
          colors={{ personal: null, fan: "#1E3A8A" }}
          faceTone="#dcd3f6"
          action={<button type="button">팔로우</button>}
        />,
      ),
    );

  it("이름 링크는 전체 이름을 title 로 갖는다(말줄임 대비)", () => {
    const a = head(null).querySelector("a");
    expect(a?.getAttribute("title")).toBe("새벽달빛라디오하루별이야하루별이달빛방송");
    expect(a?.getAttribute("href")).toBe("/c/dawn");
  });

  it("팬덤 이름이 없어도 뱃지 줄은 빈칸으로 남는다 — 있으면 그 줄에 뱃지", () => {
    const without = head(null);
    const withBadge = head("달빛지기");
    const rowsWithout = without.querySelectorAll("p");
    const rowsWith = withBadge.querySelectorAll("p");
    expect(rowsWithout.length).toBe(2);
    expect(rowsWith.length).toBe(2);
    expect(rowsWithout[1]?.childElementCount).toBe(0);
    expect(rowsWith[1]?.querySelector("[data-fandom-badge]")?.textContent).toBe("달빛지기");
  });

  it("「채널 이름 · 소개」가 둘 다 없어도 줄은 남는다", () => {
    const empty = dom(renderToStaticMarkup(<CreatorCardLine channelTitle=" " intro="" />));
    expect(empty.querySelector("p")?.textContent).toBe("");
    const full = dom(renderToStaticMarkup(<CreatorCardLine channelTitle="새벽달의 밤하늘" intro="수다 방송을 해요." />));
    expect(full.querySelector("p")?.textContent).toBe("새벽달의 밤하늘 · 수다 방송을 해요.");
  });

  it("칩이 없어도 칩 줄은 남는다 · 재기 전에는 모든 칩을 그린다", () => {
    const none = dom(renderToStaticMarkup(<CreatorCardTags tags={[]} />));
    expect(none.querySelector("p.ctags")).not.toBeNull();
    expect(none.querySelectorAll(".ctag").length).toBe(0);
    const some = dom(renderToStaticMarkup(<CreatorCardTags tags={["치지직", "버추얼"]} />));
    const row = some.querySelector("p.ctags")!;
    // 보이는 칩 둘 + 보이지 않는 재기용 사본(칩 둘 + 「+2」)
    const visible = Array.from(row.children).filter((el) => el.getAttribute("aria-hidden") !== "true");
    expect(visible.map((el) => el.textContent)).toEqual(["치지직", "버추얼"]);
  });
});

// 브라우저 측정 경로 — jsdom 은 배치를 하지 않으므로 줄 폭·칩 폭·간격을 고정값으로 준다.
// 칩 폭 = 글자 수 × 20, 「+N」 = 30, 줄 폭 = 150, 간격 = column-gap(기본 6px).
describe("칩 줄 측정 — 그린 뒤 재서 넘치는 칩을 「+N」으로", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const ROW = 150;

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function mountMeasured(tags: readonly string[], gap = "6px") {
    vi.restoreAllMocks();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("ctags") ? ROW : 0;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const text = this.textContent ?? "";
      const width = text.startsWith("+") ? 30 : text.length * 20;
      return { width, height: 22, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 22, toJSON: () => ({}) } as DOMRect;
    });
    const realStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((el: Element, pseudo?: string | null) => {
      const style = realStyle(el, pseudo);
      if (el.classList.contains("ctags")) style.columnGap = gap;
      return style;
    });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<CreatorCardTags tags={tags} />));
    const row = host.querySelector<HTMLElement>("p.ctags")!;
    const visibleChips = Array.from(row.children).filter((el) => el.classList.contains("ctag")).map((el) => el.textContent);
    const more = Array.from(row.children).find((el) => el.getAttribute("aria-hidden") === "true" && el.querySelector(".ctag") && el.children.length === 1);
    const hidden = Array.from(row.querySelectorAll(":scope > .sr-only")).map((el) => el.textContent);
    act(() => root.unmount());
    return { row, visibleChips, moreText: more?.textContent ?? null, hidden };
  }

  it("넘치면 들어가는 만큼만 보이고 나머지는 「+N」 — 가려진 이름은 화면 낭독기용으로 남는다", () => {
    // 칩 60·60·60(=192 > 150). 「+N」 30 + 6 + 60 = 96, + 6 + 60 = 162 > 150 → 1개 + 「+2」
    const r = mountMeasured(["치지직", "유튜브", "버추얼"]);
    expect(r.visibleChips).toEqual(["치지직"]);
    expect(r.moreText).toBe("+2");
    expect(r.hidden).toEqual(["유튜브", "버추얼"]);
  });

  it("간격은 CSS column-gap 을 읽는다 — 6px 이면 다 들어가고, 12px 이면 넘쳐서 「+N」", () => {
    // 6px: 60 + 6 + 80 = 146 ≤ 150 → 전부
    const narrow = mountMeasured(["치지직", "아프리카"]);
    expect(narrow.visibleChips).toEqual(["치지직", "아프리카"]);
    expect(narrow.moreText).toBeNull();
    expect(narrow.hidden).toEqual([]);
    // 12px: 60 + 12 + 80 = 152 > 150. 「+N」 30 + 12 + 60 = 102, + 12 + 80 = 194 > 150 → 1개 + 「+1」
    const wide = mountMeasured(["치지직", "아프리카"], "12px");
    expect(wide.visibleChips).toEqual(["치지직"]);
    expect(wide.moreText).toBe("+1");
    expect(wide.hidden).toEqual(["아프리카"]);
  });

  it("칩 하나가 줄보다 넓으면 「+1」 대신 그 칩 하나를 말줄임으로", () => {
    const r = mountMeasured(["아주아주긴플랫폼이름이에요"]);
    expect(r.visibleChips).toEqual(["아주아주긴플랫폼이름이에요"]);
    expect(r.moreText).toBeNull();
    expect(r.row.className).toContain("squeeze");
  });
});
