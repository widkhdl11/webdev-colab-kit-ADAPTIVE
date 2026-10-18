import { describe, expect, it } from "vitest";
import { PASTEL_TONES } from "@/shared/config/pastel-tones";
import {
  badgeBorderOf,
  contrastRatio,
  creatorColorOrNull,
  creatorColorVars,
  isThemeColor,
  mixSrgb,
  TEXT_DARK,
  hasThemeVars,
  THEME_COLORS,
} from "./creator-color";

// 크리에이터 테마 색(저장 칸 퍼스널 컬러) — creator-link INV-E13(파스텔 8색만) · INV-E14(글자색은 저장하지 않고 그때 계산, 뱃지 글자 #111827 고정).

const EIGHT = ["#FDE2E4", "#FFE5CC", "#FFF1B8", "#DFF5D8", "#D3F0EC", "#DCEBFF", "#E6E0FF", "#F6DFF0"];

describe("테마 색 위 글자 (creator-link INV-E14)", () => {
  it("INV-E14 S13: 8색 각각 뱃지 글자 #111827 의 대비가 4.5:1 이상(가장 낮은 색도 12:1 이상)", () => {
    expect(TEXT_DARK).toBe("#111827");
    for (const c of THEME_COLORS) expect(contrastRatio(c, TEXT_DARK), c).toBeGreaterThanOrEqual(12);
  });

  it("INV-E14: 대비는 WCAG 상대 휘도 계산값 — 흰색과 검정은 21:1, 같은 색은 1:1", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1E3A8A", "#1E3A8A")).toBeCloseTo(1, 5);
  });
});

describe("테마 색 = 파스텔 8색 (creator-link INV-E13)", () => {
  it("INV-E13: 고를 수 있는 색은 정본 파스텔 8색 그대로(같은 순서)", () => {
    expect([...THEME_COLORS]).toEqual(EIGHT);
    expect(THEME_COLORS).toBe(PASTEL_TONES);
  });

  it("INV-E13 S12: 8색은 그대로 색으로 받는다", () => {
    for (const c of EIGHT) {
      expect(creatorColorOrNull(c), c).toBe(c);
      expect(isThemeColor(c), c).toBe(true);
    }
  });

  it("INV-E13 S12b (실패경로): 8색 밖 값은 없는 것(기본 모양)으로 — 진한 색·이름 색·짧은 값·스타일 문장·소문자·공백·다른 형", () => {
    for (const bad of ["#1E3A8A", "#FFF59D", "#FFFFFF", "red", "#12345", "#DCEBFF; background:url(x)", "#dcebff", " #DCEBFF", "", null, undefined, 123, {}]) {
      expect(creatorColorOrNull(bad), String(bad)).toBeNull();
    }
  });

  it("INV-E13·E14 S13: 그리기 변수 — 8색이면 면·띠 글자색·뱃지 테두리(테마 색 + #1F2937 22%)를 넣는다", () => {
    expect(creatorColorVars({ personal: "#DCEBFF" })).toEqual({
      "--personal": "#DCEBFF",
      "--personal-line": mixSrgb("#DCEBFF", "#1F2937", 0.22),
    });
    // 섞은 값: 채널마다 0.78 × 테마 + 0.22 × #1F2937 — DC·EB·FF 와 1F·29·37
    expect(badgeBorderOf("#DCEBFF")).toBe("#B2C0D3");
    for (const c of THEME_COLORS) expect(creatorColorVars({ personal: c })["--personal-line"], c).toBe(badgeBorderOf(c));
  });

  it("INV-E13 S12c (실패경로): 그리기 직전 확인 — 8색 밖(옛 진한 색·스타일 문장)은 변수에 아무것도 넣지 않는다", () => {
    expect(creatorColorVars({ personal: "#1E3A8A" })).toEqual({});
    expect(creatorColorVars({ personal: "#DCEBFF; background:url(x)" })).toEqual({});
    expect(creatorColorVars({ personal: "#dcebff" })).toEqual({});
    expect(creatorColorVars({ personal: null })).toEqual({});
    expect(hasThemeVars(creatorColorVars({ personal: "#1E3A8A" }))).toBe(false);
    expect(hasThemeVars(creatorColorVars({ personal: "#DCEBFF" }))).toBe(true);
  });
});
