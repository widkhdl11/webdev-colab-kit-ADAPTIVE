import { readFileSync } from "node:fs";
import postcss, { type Root } from "postcss";
import { describe, expect, it } from "vitest";
import { TEXT_DARK } from "../model/creator-color";

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
  it("INV-E14 S13: 테마 뱃지(.fbTheme)는 면 var(--personal) · 테두리 1px var(--personal-line) · 글자 var(--badge-ink)", () => {
    const d = declsOf(parse("./creator-head.module.css"), ".fbTheme");
    expect(d["background"]).toBe("var(--personal)");
    expect(d["box-shadow"]).toBe("inset 0 0 0 1px var(--personal-line)");
    expect(d["color"]).toBe("var(--badge-ink)");
  });

  it("INV-E14 S13: 토큰 --badge-ink 는 TEXT_DARK(#111827)와 같은 값이다", () => {
    const root = parse("../../../shared/ui/tokens.css");
    const values: string[] = [];
    root.walkDecls("--badge-ink", (d) => {
      values.push(d.value.trim());
    });
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(v.toUpperCase()).toBe(TEXT_DARK);
  });
});
