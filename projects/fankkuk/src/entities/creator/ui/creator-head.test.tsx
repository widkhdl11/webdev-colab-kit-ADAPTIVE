import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreatorHead, type CreatorHeadProps } from "./creator-head";
import { FandomBadge } from "./fandom-badge";

// 크리에이터 머리·팬덤 뱃지가 색을 어디에 쓰는가 (creator-link INV-E13·E14, design-rules 12절 「팬덤 색」).

function dom(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body;
}

const base: CreatorHeadProps = {
  name: "하루",
  nameAs: "h1",
  intro: "느긋한 방송",
  photoUrl: null,
  initial: "하",
  backgroundUrl: null,
  colors: { personal: null, fan: null },
  fanName: "달빛지기",
  symbolUrl: null,
  label: "내 프로필",
};

describe("크리에이터 머리 — 퍼스널 컬러는 띠·사진 테두리, 팬컬러는 뱃지 면 (INV-E13)", () => {
  it("INV-E13 S12: 퍼스널 컬러는 머리(띠·테두리가 읽는 변수)에, 팬컬러는 뱃지에만 — 머리에는 팬컬러가 없다", () => {
    const host = dom(renderToStaticMarkup(<CreatorHead {...base} colors={{ personal: "#1E3A8A", fan: "#FFF59D" }} />));
    const head = host.querySelector<HTMLElement>("[data-creator-head]");
    const badge = host.querySelector<HTMLElement>("[data-fandom-badge]");
    expect(head?.style.getPropertyValue("--personal")).toBe("#1E3A8A");
    expect(head?.style.getPropertyValue("--fan")).toBe("");
    expect(badge?.style.getPropertyValue("--fan")).toBe("#FFF59D");
    expect(badge?.style.getPropertyValue("--personal")).toBe("");
    expect(badge?.textContent).toBe("달빛지기");
    expect(host.querySelector("h1")?.textContent).toBe("하루");
  });

  it("INV-E13 (실패경로): 꼴이 틀린 색은 스타일에 들어가지 않는다 — 기본 모양으로 그린다", () => {
    const html = renderToStaticMarkup(<CreatorHead {...base} colors={{ personal: "#123456; background:url(x)", fan: "red" }} />);
    expect(html).not.toContain("url(x)");
    expect(html).not.toContain("red");
    const host = dom(html);
    expect(host.querySelector<HTMLElement>("[data-creator-head]")?.style.getPropertyValue("--personal")).toBe("");
    expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.style.getPropertyValue("--fan")).toBe("");
  });

  it("INV-E13: 팬덤 이름이 없으면 뱃지를 그리지 않는다", () => {
    const host = dom(renderToStaticMarkup(<CreatorHead {...base} fanName="" colors={{ personal: null, fan: "#FFF59D" }} />));
    expect(host.querySelector("[data-fandom-badge]")).toBeNull();
  });
});

describe("팬덤 뱃지 글자색 — 그때 계산 (INV-E14)", () => {
  it("INV-E14 S13: #FFF59D 위 #111827, #1E3A8A 위 흰색, #777777 위 흰색", () => {
    for (const [fan, on] of [
      ["#FFF59D", "#111827"],
      ["#1E3A8A", "#FFFFFF"],
      ["#777777", "#FFFFFF"],
    ] as const) {
      const badge = dom(renderToStaticMarkup(<FandomBadge name="달빛지기" symbolUrl={null} fanColor={fan} />)).querySelector<HTMLElement>("[data-fandom-badge]");
      expect(badge?.style.getPropertyValue("--on-fan"), fan).toBe(on);
    }
  });

  it("INV-E14: 크리에이터 머리 안의 뱃지와 따로 그린 뱃지(미리보기)의 글자색이 같다 — 같은 계산 하나", () => {
    const inHead = dom(renderToStaticMarkup(<CreatorHead {...base} colors={{ personal: null, fan: "#89CFF0" }} />)).querySelector<HTMLElement>("[data-fandom-badge]");
    const alone = dom(renderToStaticMarkup(<FandomBadge name="달빛지기" symbolUrl={null} fanColor="#89CFF0" large />)).querySelector<HTMLElement>("[data-fandom-badge]");
    expect(inHead?.style.getPropertyValue("--on-fan")).toBe("#111827");
    expect(alone?.style.getPropertyValue("--on-fan")).toBe(inHead?.style.getPropertyValue("--on-fan"));
  });
});
