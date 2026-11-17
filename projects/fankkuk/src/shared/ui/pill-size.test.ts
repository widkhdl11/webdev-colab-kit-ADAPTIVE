// @vitest-environment node
// 알약 모양(뱃지·칩·태그·알약 버튼) 크기는 공용 값(토큰)으로만 정한다 — design-rules 「버튼·탭·뱃지 크기」.
//
// 왜 이 검사가 있나: 공용 .tag·.chip·.btn 을 줄여도, 화면 CSS 가 알약을 따로 그리며 높이·글자를 숫자로 적어 두면
// 그 화면은 예전 크기로 남는다(base.css 는 @layer base 라 화면 CSS 가 늘 이긴다). 2026-11-17 하루에 두 번 그렇게 빠졌다.
// 높이·글자를 토큰으로 적으면 크기를 바꿀 때 tokens.css 한 곳만 고치면 되고, 숫자로 적으면 여기서 실패한다.
//
// 걸리는 것: 화면 CSS(*.module.css) 의 한 규칙이 border-radius 를 알약(--r-pill·--r-tag·9999px)으로 두면서
//   ① min-height/height 를 숫자로 적었다 ② font-size 를 숫자로 적었다 ③ 높이 없이 안쪽 여백·글자 크기로 키운다.
// 안 걸리는 것: 폭이 정해진 원·스위치·아이콘(width 가 auto/100% 가 아님), ::before/::after, 높이 20 미만이거나 % 인 막대·띠,
//   운영자 화면(design-rules 8절 — 따로 정한 크기), 블록 안에 `pill-size-exempt: <사유>` 주석이 있는 규칙.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const PILL = /border-radius\s*:\s*(var\(--r-(pill|tag)\)|9{3,}px)/;
const TOKEN = /^var\(--/;

function decl(block: string, name: string): string | null {
  for (const part of block.split(";")) {
    const i = part.indexOf(":");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function pxValue(v: string): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v);
  return m ? Number(m[1]) : null;
}

/** 한 CSS 파일에서 규칙 위반을 찾아 「줄 선택자 — 이유」 목록으로 돌려준다 */
export function findPillSizeViolations(css: string): string[] {
  // 주석은 줄 수를 지키며 지우되, 예외 주석은 표시로 남긴다
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (c) => (c.includes("pill-size-exempt:") ? "__EXEMPT__" : c.replace(/[^\n]/g, " ")));
  const out: string[] = [];
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? "").trim().split("\n").pop()?.trim() ?? "";
    const block = m[2] ?? "";
    if (!PILL.test(block) || block.includes("__EXEMPT__")) continue;
    if (/::?(before|after)\b/.test(selector) || /aspect-ratio/.test(block)) continue;
    const width = decl(block, "width");
    if (width && !/^(auto|100%|max-content|fit-content)$/.test(width)) continue;
    const height = decl(block, "min-height") ?? decl(block, "height");
    if (height) {
      const px = pxValue(height);
      if ((px !== null && px < 20) || height.endsWith("%")) continue; // 진행 막대·띠
    }
    const fontSize = decl(block, "font-size");
    const sizesItself = decl(block, "padding") !== null || decl(block, "padding-block") !== null || fontSize !== null;
    const why: string[] = [];
    if (height && !TOKEN.test(height)) why.push(`높이 ${height} → var(--tag-h)·var(--btn-h-sm)·var(--btn-h) 중 하나`);
    if (fontSize && !TOKEN.test(fontSize)) why.push(`글자 ${fontSize} → var(--fs-badge)·var(--fs-small)`);
    if (!height && sizesItself) why.push("높이 없이 여백·글자로 크기가 정해짐 → min-height 를 토큰으로");
    if (why.length) {
      const line = src.slice(0, (m.index ?? 0) + (m[1] ?? "").length).split("\n").length;
      out.push(`${line} ${selector} — ${why.join(", ")}`);
    }
  }
  return out;
}

function moduleCssFiles(dir: string): string[] {
  const files: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...moduleCssFiles(p));
    else if (e.name.endsWith(".module.css")) files.push(p);
  }
  return files;
}

describe("알약 모양 크기는 토큰으로만", () => {
  it("검사가 실제로 잡는다 — 일부러 심은 위반", () => {
    expect(findPillSizeViolations(".a { min-height: 44px; border-radius: var(--r-pill); }")).toHaveLength(1);
    expect(findPillSizeViolations(".b { padding: 2px 12px; font-size: 14px; border-radius: var(--r-tag); }")).toHaveLength(1);
    expect(findPillSizeViolations(".c { padding: 4px 12px; border-radius: 9999px; }")).toHaveLength(1);
  });

  it("검사가 놓아주는 것 — 토큰·원·막대·예외 주석", () => {
    expect(findPillSizeViolations(".a { min-height: var(--tag-h); font-size: var(--fs-badge); border-radius: var(--r-pill); }")).toEqual([]);
    expect(findPillSizeViolations(".face { width: 40px; height: 40px; border-radius: var(--r-pill); }")).toEqual([]);
    expect(findPillSizeViolations(".bar i { height: 8px; border-radius: var(--r-pill); }")).toEqual([]);
    expect(findPillSizeViolations(".s { min-height: 48px; border-radius: var(--r-pill); /* pill-size-exempt: 가입 단계 줄 */ }")).toEqual([]);
  });

  it("화면 CSS 에 숫자로 크기를 적은 알약이 없다", () => {
    const found: string[] = [];
    for (const f of moduleCssFiles(SRC)) {
      const rel = relative(SRC, f).replaceAll("\\", "/");
      if (/(^|\/)admin/.test(rel) || rel.includes("/admin")) continue; // 운영자 화면은 따로 정한 크기
      for (const v of findPillSizeViolations(readFileSync(f, "utf8"))) found.push(`${rel}:${v}`);
    }
    expect(found, `알약 크기를 숫자로 적은 곳 ${found.length}개:\n${found.join("\n")}`).toEqual([]);
  });
});
