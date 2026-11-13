import { describe, expect, it } from "vitest";
import { PASTEL_TONES } from "@/shared/config/pastel-tones";
import {
  BADGE_INK_DARK,
  BADGE_INK_LIGHT,
  badgeBorderOf,
  badgeInkOf,
  contrastRatio,
  creatorColorOrNull,
  creatorColorVars,
  FIT_LIGHT_MIN,
  fitLight,
  hasThemeVars,
  isThemeColor,
  luminance,
  mixSrgb,
  THEME_COLORS,
  toThemeColor,
  toThemeColorLoose,
  type ThemeColor,
} from "./creator-color";

// 크리에이터 테마 색(저장 칸 퍼스널 컬러) — creator-link INV-E13(#RRGGBB 꼴이면 아무 색, 8색은 견본) ·
// INV-E14(글자색은 저장하지 않고 그때 계산 — 뱃지 글자는 #000000·#FFFFFF 중 대비가 큰 쪽). 2026-11-13 개정.

const EIGHT = ["#FDE2E4", "#FFE5CC", "#FFF1B8", "#DFF5D8", "#D3F0EC", "#DCEBFF", "#E6E0FF", "#F6DFF0"];
const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}` as ThemeColor;

describe("테마 색 위 글자 (creator-link INV-E14)", () => {
  it("INV-E14 S13: 8색은 검정 글자, 진한 색 #2B4C9B 는 흰 글자 — 둘 다 4.5:1 이상", () => {
    for (const c of THEME_COLORS) {
      expect(badgeInkOf(c), c).toBe(BADGE_INK_DARK);
      expect(contrastRatio(c, badgeInkOf(c)), c).toBeGreaterThanOrEqual(4.5);
    }
    expect(badgeInkOf("#2B4C9B")).toBe(BADGE_INK_LIGHT);
    expect(contrastRatio("#2B4C9B", BADGE_INK_LIGHT)).toBeGreaterThanOrEqual(4.5);
  });

  it("INV-E14 S13: 어떤 색에서도 고른 글자의 대비가 4.5:1 이상 — RGB 를 3 간격으로 모두 훑고, 가장 낮은 색 근처 #5D60FF 도", () => {
    let worst = 21;
    for (let r = 0; r < 256; r += 3) {
      for (let g = 0; g < 256; g += 3) {
        for (let b = 0; b < 256; b += 3) {
          const c = hex(r, g, b);
          worst = Math.min(worst, contrastRatio(c, badgeInkOf(c)));
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#5D60FF", badgeInkOf("#5D60FF"))).toBeGreaterThanOrEqual(4.5);
  });

  it("INV-E14 (실패경로): 옛 고정 글자 #111827 은 가장 나쁜 색에서 4.5:1 에 못 미친다 — 그래서 검정·흰색을 쓴다", () => {
    expect(Math.max(contrastRatio("#9F66AE", "#111827"), contrastRatio("#9F66AE", "#FFFFFF"))).toBeLessThan(4.5);
    expect(contrastRatio("#9F66AE", badgeInkOf("#9F66AE"))).toBeGreaterThanOrEqual(4.5);
  });

  it("INV-E14: 대비는 WCAG 상대 휘도 계산값 — 흰색과 검정은 21:1, 같은 색은 1:1", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1E3A8A", "#1E3A8A")).toBeCloseTo(1, 5);
  });
});

describe("테마 색 = #RRGGBB 꼴, 8색은 견본 (creator-link INV-E13)", () => {
  it("INV-E13: 견본은 정본 파스텔 8색 그대로(같은 순서)", () => {
    expect([...THEME_COLORS]).toEqual(EIGHT);
    expect(THEME_COLORS).toBe(PASTEL_TONES);
  });

  it("INV-E13 S12: 8색과 진한 색(#2B4C9B·#1E3A8A·#000000·#FFFFFF)을 모두 색으로 받는다", () => {
    for (const c of [...EIGHT, "#2B4C9B", "#1E3A8A", "#000000", "#FFFFFF"]) {
      expect(creatorColorOrNull(c), c).toBe(c);
      expect(isThemeColor(c), c).toBe(true);
    }
  });

  it("INV-E13 S12b (실패경로): 꼴이 틀린 값은 없는 것(기본 모양)으로 — 이름 색·짧은 값·스타일 문장·소문자(저장 꼴 아님)·공백·다른 형", () => {
    for (const bad of ["red", "#12345", "#DCEBFF; background:url(x)", "#dcebff", " #DCEBFF", "#DCEBFF0", "DCEBFF", "#GGGGGG", "", null, undefined, 123, {}]) {
      expect(creatorColorOrNull(bad), String(bad)).toBeNull();
    }
  });

  it("INV-E13: 고르개 값(소문자)은 대문자 저장 꼴로 — 꼴이 틀리면 null", () => {
    expect(toThemeColor("#2b4c9b")).toBe("#2B4C9B");
    expect(toThemeColor("2b4c9b")).toBeNull();
    expect(toThemeColor("#2b4c9b; x")).toBeNull();
  });

  it("INV-E13: 색 코드 칸은 앞뒤 공백·「#」 없는 값도 받고, 꼴이 틀리면 null", () => {
    expect(toThemeColorLoose(" 2b4c9b ")).toBe("#2B4C9B");
    expect(toThemeColorLoose(" #2b4c9b")).toBe("#2B4C9B");
    for (const bad of ["#12", "2b4c9b; x", "#GGGGGG", ""]) expect(toThemeColorLoose(bad), bad).toBeNull();
  });

  it("INV-E13·E14 S13: 그리기 변수 — 면·뱃지 테두리(테마 색 + #1F2937 22%)·뱃지 글자를 넣는다", () => {
    expect(creatorColorVars({ personal: "#DCEBFF" })).toEqual({
      "--personal": "#DCEBFF",
      "--personal-line": mixSrgb("#DCEBFF", "#1F2937", 0.22),
      "--personal-ink": "#000000",
    });
    // 섞은 값: 채널마다 0.78 × 테마 + 0.22 × #1F2937 — DC·EB·FF 와 1F·29·37
    expect(badgeBorderOf("#DCEBFF")).toBe("#B2C0D3");
    expect(creatorColorVars({ personal: "#2B4C9B" })["--personal-ink"]).toBe("#FFFFFF");
    for (const c of THEME_COLORS) expect(creatorColorVars({ personal: c })["--personal-line"], c).toBe(badgeBorderOf(c));
  });

  it("INV-E13 (실패경로): 그리기 직전 확인 — 꼴이 틀린 값(스타일 문장·소문자)은 변수에 아무것도 넣지 않는다", () => {
    expect(creatorColorVars({ personal: "#DCEBFF; background:url(x)" })).toEqual({});
    expect(creatorColorVars({ personal: "#dcebff" })).toEqual({});
    expect(creatorColorVars({ personal: null })).toEqual({});
    expect(hasThemeVars(creatorColorVars({ personal: "red" }))).toBe(false);
    expect(hasThemeVars(creatorColorVars({ personal: "#1E3A8A" }))).toBe(true);
  });
});

describe("「옅게 맞추기」 (creator-link INV-E13 — 화면 기능)", () => {
  it("진한 색은 흰색을 섞어 밝기 0.70 이상으로 — 시안 값 #2B4C9B → #D4DAEA", () => {
    expect(fitLight("#2B4C9B")).toBe("#D4DAEA");
    for (const c of ["#2B4C9B", "#E8467C", "#7C3AED", "#111111", "#000000", "#1E3A8A"] as const) {
      const f = fitLight(c);
      expect(isThemeColor(f), c).toBe(true);
      expect(luminance(f), c).toBeGreaterThanOrEqual(FIT_LIGHT_MIN);
    }
  });

  it("이미 밝은 색(8색·#FFD6A5·#FFFFFF)은 그대로", () => {
    for (const c of [...THEME_COLORS, "#FFD6A5", "#FFFFFF"] as const) expect(fitLight(c), c).toBe(c);
  });

  it("맞춘 색은 가장 진한 쪽이다 — 섞는 비율을 0.001 씩 훑어 처음 0.70 에 닿는 색과 같다", () => {
    for (const c of ["#2B4C9B", "#E8467C", "#7C3AED", "#000000"] as const) {
      let first = "";
      for (let i = 0; i <= 1000 && !first; i += 1) {
        const m = mixSrgb(c, "#FFFFFF", i / 1000);
        if (luminance(m) >= FIT_LIGHT_MIN) first = m;
      }
      // 0.001 간격보다 촘촘한 반올림 차이는 한 채널 1 이내로 본다
      const f = fitLight(c);
      for (const at of [1, 3, 5]) expect(Math.abs(Number.parseInt(f.slice(at, at + 2), 16) - Number.parseInt(first.slice(at, at + 2), 16)), c).toBeLessThanOrEqual(1);
    }
  });
});
