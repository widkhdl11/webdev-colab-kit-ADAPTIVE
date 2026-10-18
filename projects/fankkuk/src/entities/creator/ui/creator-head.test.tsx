import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreatorHead, type CreatorHeadProps } from "./creator-head";
import { FandomBadge } from "./fandom-badge";
import s from "./creator-head.module.css";
import { badgeBorderOf, THEME_COLORS, type ThemeColor } from "../model/creator-color";

// 크리에이터 머리·팬덤 뱃지가 테마 색을 어디에 쓰는가 (creator-link INV-E13·E14, design-rules 17절).

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
  colors: { personal: null },
  fanName: "달빛지기",
  symbolUrl: null,
  label: "내 프로필",
};

describe("크리에이터 머리 — 테마 색은 띠·사진 테두리·팬덤 뱃지 (INV-E13)", () => {
  it("INV-E13 S12: 테마 색 #DCEBFF 는 머리(띠·테두리가 읽는 변수)와 뱃지 면에 같이 쓰인다", () => {
    const host = dom(renderToStaticMarkup(<CreatorHead {...base} colors={{ personal: "#DCEBFF" }} />));
    const head = host.querySelector<HTMLElement>("[data-creator-head]");
    const badge = host.querySelector<HTMLElement>("[data-fandom-badge]");
    expect(head?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
    expect(head?.classList.contains(s.tinted)).toBe(true);
    expect(badge?.style.getPropertyValue("--personal")).toBe("#DCEBFF");
    expect(badge?.classList.contains(s.fbTheme)).toBe(true);
    expect(badge?.textContent).toBe("달빛지기");
    expect(host.querySelector("h1")?.textContent).toBe("하루");
  });

  it("INV-E13 S12c (실패경로): 8색 밖 값(옛 진한 색·스타일 문장)은 스타일에 들어가지 않는다 — 기본 모양으로 그린다", () => {
    for (const bad of ["#1E3A8A", "#DCEBFF; background:url(x)"]) {
      const html = renderToStaticMarkup(<CreatorHead {...base} colors={{ personal: bad as ThemeColor }} />);
      expect(html, bad).not.toContain("url(x)");
      expect(html, bad).not.toContain("#1E3A8A");
      const host = dom(html);
      expect(host.querySelector<HTMLElement>("[data-creator-head]")?.classList.contains(s.tinted), bad).toBe(false);
      expect(host.querySelector<HTMLElement>("[data-fandom-badge]")?.classList.contains(s.fbTheme), bad).toBe(false);
    }
  });

  it("INV-E13: 팬덤 이름이 없으면 뱃지를 그리지 않는다", () => {
    const host = dom(renderToStaticMarkup(<CreatorHead {...base} fanName="" colors={{ personal: "#DCEBFF" }} />));
    expect(host.querySelector("[data-fandom-badge]")).toBeNull();
  });
});

describe("팬덤 뱃지 — 면 테마 색 · 테두리 #1F2937 22% · 글자 #111827 (INV-E14)", () => {
  it("INV-E14 S13: 8색 각각 테마 모양(.fbTheme)에 면 = 그 색, 테두리 = 그 색 + #1F2937 22% — 글자색 변수는 없다(CSS 고정)", () => {
    for (const c of THEME_COLORS) {
      const badge = dom(renderToStaticMarkup(<FandomBadge name="달빛지기" symbolUrl={null} themeColor={c} />)).querySelector<HTMLElement>("[data-fandom-badge]");
      expect(badge?.classList.contains(s.fbTheme), c).toBe(true);
      expect(badge?.style.getPropertyValue("--personal"), c).toBe(c);
      expect(badge?.style.getPropertyValue("--personal-line"), c).toBe(badgeBorderOf(c));
      expect(badge?.style.getPropertyValue("color"), c).toBe("");
    }
  });

  it("INV-E14 (실패경로): 테마 색이 없거나 8색 밖이면 테마 모양이 붙지 않는다 — 사이트 기본 뱃지", () => {
    for (const c of [null, "#1E3A8A", "#FFF59D", "red"]) {
      const badge = dom(renderToStaticMarkup(<FandomBadge name="달빛지기" symbolUrl={null} themeColor={c as ThemeColor | null} />)).querySelector<HTMLElement>("[data-fandom-badge]");
      expect(badge?.classList.contains(s.fbTheme), String(c)).toBe(false);
      expect(badge?.getAttribute("style") ?? "", String(c)).toBe("");
    }
  });

  it("INV-E14: 크리에이터 머리 안의 뱃지와 따로 그린 큰 뱃지(미리보기)가 같은 색 모양이다", () => {
    const inHead = dom(renderToStaticMarkup(<CreatorHead {...base} colors={{ personal: "#FFF1B8" }} />)).querySelector<HTMLElement>("[data-fandom-badge]");
    const alone = dom(renderToStaticMarkup(<FandomBadge name="달빛지기" symbolUrl={null} themeColor="#FFF1B8" size="large" />)).querySelector<HTMLElement>("[data-fandom-badge]");
    for (const badge of [inHead, alone]) {
      expect(badge?.classList.contains(s.fbTheme)).toBe(true);
      expect(badge?.style.getPropertyValue("--personal")).toBe("#FFF1B8");
    }
  });
});
