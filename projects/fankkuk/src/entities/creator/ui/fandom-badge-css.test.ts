import { readFileSync } from "node:fs";
import postcss, { type Root } from "postcss";
import { describe, expect, it } from "vitest";
import { creatorColorVars } from "../model/creator-color";

// 팬덤 뱃지 색이 CSS 에서 실제로 어떤 값을 쓰는가 (creator-link INV-E14, design-rules 17절).
// 단위 시험의 DOM(jsdom)은 CSS 모듈 값을 계산하지 않으므로, 스타일 파일을 postcss 로 읽어 선언을 직접 본다.

function parse(relPath: string): Root {
  return postcss.parse(readFileSync(new URL(relPath, import.meta.url), "utf8"));
}

/** 선택자가 정확히 selector 인 규칙의 선언(속성 → 값). 없으면 빈 객체. */
function declsOf(root: Root, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  root.walkRules((rule) => {
    if (rule.selector.trim() !== selector) return;
    rule.walkDecls((d) => {
      out[d.prop] = d.value;
    });
  });
  return out;
}

describe("팬덤 뱃지 CSS (INV-E14)", () => {
  it("INV-E14 S13: 테마 뱃지(.fbTheme)는 면 var(--personal) · 테두리 1px var(--personal-line) · 글자 var(--personal-ink)", () => {
    const d = declsOf(parse("./creator-head.module.css"), ".fbTheme");
    expect(d["background"]).toBe("var(--personal)");
    expect(d["box-shadow"]).toBe("inset 0 0 0 1px var(--personal-line)");
    expect(d["color"]).toBe("var(--personal-ink)");
  });

  it("INV-E14 S13: --personal-ink 는 사이트 토큰이 아니라 크리에이터마다 creatorColorVars 가 넣는 값(#000000·#FFFFFF)이다", () => {
    const root = parse("../../../shared/ui/tokens.css");
    let inTokens = 0;
    root.walkDecls("--personal-ink", () => {
      inTokens += 1;
    });
    expect(inTokens).toBe(0);
    expect(creatorColorVars({ personal: "#DCEBFF" })["--personal-ink"]).toBe("#000000");
    expect(creatorColorVars({ personal: "#2B4C9B" })["--personal-ink"]).toBe("#FFFFFF");
  });
});
