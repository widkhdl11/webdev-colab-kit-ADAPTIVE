import { describe, expect, it } from "vitest";
import { contrastRatio, creatorColorOrNull, creatorColorVars, parseColorField, TEXT_DARK, TEXT_LIGHT, textOnColor } from "./creator-color";

// 크리에이터 색(퍼스널 컬러·팬컬러) — creator-link INV-E13(형식) · INV-E14(글자색은 저장하지 않고 그때 계산).

describe("크리에이터 색 위 글자색 (creator-link INV-E14)", () => {
  it("INV-E14 S13: 밝은 팬컬러 #FFF59D 위 글자는 #111827, 어두운 #1E3A8A 위 글자는 흰색", () => {
    expect(textOnColor("#FFF59D")).toBe(TEXT_DARK);
    expect(TEXT_DARK).toBe("#111827");
    expect(textOnColor("#1E3A8A")).toBe(TEXT_LIGHT);
    expect(TEXT_LIGHT).toBe("#FFFFFF");
  });

  it("INV-E14 S13b: 경계 색 #777777 — 흰색 대비가 4.5:1 에 조금 못 미쳐도 큰 쪽(흰색)을 고른다", () => {
    const white = contrastRatio("#777777", "#FFFFFF");
    const dark = contrastRatio("#777777", "#111827");
    expect(white).toBeGreaterThan(4.4);
    expect(white).toBeLessThan(4.5);
    expect(dark).toBeGreaterThan(3.9);
    expect(dark).toBeLessThan(4.1);
    expect(textOnColor("#777777")).toBe(TEXT_LIGHT);
  });

  it("INV-E14: 대비는 WCAG 상대 휘도 계산값 — 흰색과 검정은 21:1, 같은 색은 1:1", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#1E3A8A", "#1E3A8A")).toBeCloseTo(1, 5);
    // 채널마다 다른 무게(초록이 가장 무겁다) — 같은 값의 빨강·초록 위 글자가 갈린다
    expect(textOnColor("#00B000")).toBe(TEXT_DARK);
    expect(textOnColor("#B00000")).toBe(TEXT_LIGHT);
  });

  it("INV-E14: 대비가 큰 쪽을 고른다 — 늘 두 후보 가운데 큰 값과 같다", () => {
    for (const c of ["#FFFFFF", "#000000", "#89CFF0", "#9D174D", "#FDBA74", "#334155", "#808080", "#767676", "#7F7F7F"]) {
      const pick = textOnColor(c);
      const best = Math.max(contrastRatio(c, TEXT_LIGHT), contrastRatio(c, TEXT_DARK));
      expect(contrastRatio(c, pick), c).toBe(best);
    }
  });
});

describe("크리에이터 색 형식 (creator-link INV-E13)", () => {
  it("INV-E13: 저장 형식(#RRGGBB 대문자)만 색으로 받는다", () => {
    expect(creatorColorOrNull("#1E3A8A")).toBe("#1E3A8A");
    expect(creatorColorOrNull("#FFF59D")).toBe("#FFF59D");
  });

  it("INV-E13 S12b (실패경로): 형식 밖 값은 없는 것(기본 모양)으로 — 이름 색·짧은 값·스타일 문장·소문자·빈 값·다른 형", () => {
    for (const bad of ["red", "#12345", "#123456; background:url(x)", "#1e3a8a", " #1E3A8A", "#1E3A8A ", "", "#GGGGGG", "1E3A8A", null, undefined, 123, {}]) {
      expect(creatorColorOrNull(bad), String(bad)).toBeNull();
    }
  });

  it("INV-E13·E14: 그리기 변수 — 형식인 색만 넣고, 띠 글자색은 계산해 붙이며 뱃지 글자색 변수는 없다", () => {
    expect(creatorColorVars({ personal: "#FFF59D", fan: "#1E3A8A" })).toEqual({
      "--personal": "#FFF59D",
      "--on-personal": TEXT_DARK,
      "--fan": "#1E3A8A",
    });
    expect(creatorColorVars({ personal: null, fan: "#777777" })).toEqual({ "--fan": "#777777" });
  });

  it("INV-E13 (실패경로): 그리기 직전 형식 확인 — 스타일 문장을 끼운 값은 변수에 들어가지 않는다", () => {
    expect(creatorColorVars({ personal: "#123456; background:url(x)", fan: "red" })).toEqual({});
    expect(creatorColorVars({ personal: "#1e3a8a", fan: null })).toEqual({});
  });
});

describe("색 입력 칸 읽기 (creator-link INV-E13)", () => {
  it("INV-E13: 빈 칸은 기본(null), #RRGGBB 는 대소문자 상관없이 대문자로, 앞뒤 공백은 뺀다", () => {
    expect(parseColorField("")).toEqual({ ok: true, value: null });
    expect(parseColorField("  ")).toEqual({ ok: true, value: null });
    expect(parseColorField(" #1e3a8a ")).toEqual({ ok: true, value: "#1E3A8A" });
  });

  it("INV-E13 (실패경로): 그 밖의 꼴은 틀림 — 미리보기에 쓰지 않는다", () => {
    for (const bad of ["red", "#12345", "#123456; background:url(x)", "1E3A8A", "#GGGGGG"]) expect(parseColorField(bad), bad).toEqual({ ok: false });
  });
});
