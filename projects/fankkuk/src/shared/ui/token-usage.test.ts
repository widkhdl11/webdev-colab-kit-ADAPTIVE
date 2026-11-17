// @vitest-environment node
// 부품 크기·글자·색·모서리는 공용 값(토큰)으로만 정한다 — design-rules 「버튼·탭·뱃지 크기」 끝 줄.
//
// 왜 이 검사가 있나: 공용 .tag·.chip·.btn·.input 을 고쳐도, 화면 CSS 가 같은 모양을 따로 그리며 높이·글자·색을 숫자로
// 적어 두면 그 화면은 예전 값으로 남는다(base.css 는 @layer base 라 화면 CSS 가 늘 이긴다). 2026-11-17 하루에 두 번
// 그렇게 빠졌다. 토큰으로 적으면 값을 바꿀 때 tokens.css 한 곳만 고치면 되고, 숫자로 적으면 여기서 실패한다.
//
// 화면 CSS(*.module.css) 에서 걸리는 것
//   알약(border-radius 가 --r-pill·--r-tag·9999px): 높이·글자를 숫자로 / 높이 없이 여백·글자로만 키움
//   버튼·입력창 모양(border-radius 가 --r-btn): 높이 32 이상을 숫자로
//   입력칸(input·select·textarea): 높이 32 이상을 숫자로
//   공용 부품(:global(.btn|.tab|.chip|.tag|.input|.field|.opt))의 높이·글자를 숫자로 덮어씀
//   글자 크기 숫자(px) · 색 직접(#hex) · 모서리 숫자(px)
// 안 걸리는 것: 폭이 정해진 원·스위치·아이콘, ::before/::after, 높이 20 미만이거나 % 인 막대·띠, 운영자 화면(design-rules 8절),
//   사무실 작업 화면(features/office-*·shared/ui/work.module.css), url() 안의 #값, 4px 이하 모서리, 공용 부품 안 아이콘 크기,
//   블록 안에 `token-exempt: <사유>`(옛 이름 pill-size-exempt 도 받음) 주석이 있는 규칙.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..");
const PILL = /border-radius\s*:\s*(var\(--r-(pill|tag)\)|9{3,}px)/;
const BTN_RADIUS = /border-radius\s*:\s*var\(--r-btn/;
const SHARED_PART = /:global\(\.(btn|tab|chip|tag|input|field|opt)\b/;
const TOKEN = /^var\(--/;
const EXEMPT = /(token|pill-size)-exempt:/;

function decl(block: string, name: string): string | null {
  let found: string | null = null;
  for (const part of block.split(";")) {
    const i = part.indexOf(":");
    if (i > 0 && part.slice(0, i).trim() === name) found = part.slice(i + 1).trim();
  }
  return found;
}

function px(v: string | null): number | null {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v ?? "");
  return m ? Number(m[1]) : null;
}

/** 한 CSS 파일에서 규칙 위반을 찾아 「줄 선택자 — 이유」 목록으로 돌려준다 */
export function findTokenViolations(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (c) => (EXEMPT.test(c) ? "__EXEMPT__" : c.replace(/[^\n]/g, " ")));
  const out: string[] = [];
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (m[1] ?? "").trim().split("\n").pop()?.trim() ?? "";
    const block = m[2] ?? "";
    if (block.includes("__EXEMPT__") || selector.startsWith("@")) continue;
    const pseudo = /::?(before|after)\b/.test(selector);
    const width = decl(block, "width");
    const fixedWidth = !!width && !/^(auto|100%|max-content|fit-content)$/.test(width);
    const height = decl(block, "min-height") ?? decl(block, "height");
    const heightPx = px(height);
    const bar = (heightPx !== null && heightPx < 20) || !!height?.endsWith("%");
    const fontSize = decl(block, "font-size");
    const why: string[] = [];

    // 알약
    if (PILL.test(block) && !pseudo && !fixedWidth && !/aspect-ratio/.test(block) && !bar) {
      const sizesItself = decl(block, "padding") !== null || decl(block, "padding-block") !== null || fontSize !== null;
      if (height && !TOKEN.test(height)) why.push(`알약 높이 ${height} → var(--tag-h)·var(--btn-h-sm)·var(--btn-h)`);
      if (!height && sizesItself) why.push("알약 높이 없이 여백·글자로 크기가 정해짐 → min-height 를 토큰으로");
    }
    // 버튼·입력창 모양
    if (BTN_RADIUS.test(block) && !pseudo && !fixedWidth && heightPx !== null && heightPx >= 32 && heightPx <= 52) { // 56 이상은 카드형 줄·고르기 카드
      why.push(`버튼·입력창 높이 ${height} → var(--btn-h)·var(--btn-h-sm)·var(--field-h)·var(--hit)`);
    }
    // 입력칸
    if (/\b(input|select)\b/.test(selector) && !/textarea/.test(selector) && !pseudo && heightPx !== null && heightPx >= 32 && !why.length) {
      why.push(`입력칸 높이 ${height} → var(--field-h)`);
    }
    // 공용 부품 덮어쓰기
    if (SHARED_PART.test(selector) && !/\b(svg|img)\)?$/.test(selector) && !why.length && heightPx !== null && heightPx >= 20) {
      why.push(`공용 부품 높이를 ${height} 로 덮어씀 → 토큰`);
    }
    // 글자·색·모서리
    if (fontSize && px(fontSize) !== null) why.push(`글자 ${fontSize} → var(--fs-*)`);
    // url() 안 그림과 마스크(모양만 쓰고 색은 안 보인다)는 뺀다
    const colorPart = block.replace(/url\([^)]*\)/g, "").replace(/(-webkit-)?mask\s*:[^;]*/g, "");
    if (/(^|[\s:,(])#[0-9a-fA-F]{3,8}\b/.test(colorPart)) why.push("색을 #값으로 직접 → 토큰");
    const radius = decl(block, "border-radius");
    const radiusPx = [...(radius ?? "").matchAll(/(\d+)px/g)].map((r) => Number(r[1]));
    // 4px 이하는 막대 끝·초점 테두리 같은 장식
    if (radius && radiusPx.some((n) => n > 4) && !/^9{3,}px$/.test(radius) && !TOKEN.test(radius)) why.push(`모서리 ${radius} → var(--r-*)`);

    if (why.length) {
      const line = src.slice(0, (m.index ?? 0) + (m[1] ?? "").length).split("\n").length;
      out.push(`${line} ${selector} — ${why.join(", ")}`);
    }
  }
  return out;
}

/**
 * base.css 앞쪽의 「운영자 화면 값」 규칙(token-exempt 사유에 그 말이 있는 것)마다, 같은 부품 이름을 가진
 * `:not(.admin-area` 규칙이 높이를 토큰으로 정하는지 본다. 없으면 그 부품은 사이트 화면에서도 옛 숫자 크기로 남는다.
 */
export function findUncoveredAdminValues(css: string): string[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (c) => (c.includes("운영자 화면 값") ? "__ADMIN__" : ""));
  const blocks = [...src.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: (m[1] ?? "").trim(), body: m[2] ?? "" }));
  const missing: string[] = [];
  // 선택자를 대상 목록으로: `:where(:not(.admin-area *))` 를 떼고, `:is(a, b)` 를 풀고, `.tag.tag` 같은 반복을 하나로.
  // 그 부품 자체가 대상인 규칙만 맞는다 — `.opt input` 은 `.opt` 와 다른 대상이라 부품 높이를 덮은 것으로 치지 않는다
  const targets = (sel: string) => {
    const plain = sel.replaceAll(":where(:not(.admin-area *))", "").trim();
    const list = /^:is\((.*)\)$/.exec(plain)?.[1] ?? plain;
    return list.split(",").map((p) => p.trim().replace(/(\.[\w-]+)\1+/g, "$1"));
  };
  for (const b of blocks.filter((x) => x.body.includes("__ADMIN__"))) {
    const covering = blocks.filter((o) => {
      if (!o.sel.includes(":not(.admin-area")) return false;
      const h = decl(o.body, "min-height") ?? decl(o.body, "height");
      return !!h && TOKEN.test(h);
    });
    for (const t of targets(b.sel)) {
      if (!covering.some((o) => targets(o.sel).includes(t))) missing.push(t);
    }
  }
  return missing;
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

describe("부품 크기·글자·색·모서리는 토큰으로만", () => {
  it("검사가 실제로 잡는다 — 갈래마다 일부러 심은 위반", () => {
    const one = (css: string) => expect(findTokenViolations(css), css).toHaveLength(1);
    one(".a { min-height: 44px; border-radius: var(--r-pill); }"); // 알약 높이 숫자
    one(".b { padding: 2px 12px; border-radius: var(--r-tag); }"); // 알약 여백으로 커짐
    one(".c { min-height: 52px; border-radius: var(--r-btn); }"); // 버튼 모양 높이
    one(".d input { height: 48px; }"); // 입력칸 높이
    one(".e :global(.btn) { min-height: 48px; }"); // 공용 부품 덮어쓰기
    one(".f { font-size: 15px; }"); // 글자 숫자
    one(".g { color: #333; }"); // 색 직접
    one(".h { border-radius: 10px; }"); // 모서리 숫자
  });

  it("검사가 놓아주는 것 — 토큰·원·막대·예외 주석", () => {
    const none = (css: string) => expect(findTokenViolations(css), css).toEqual([]);
    none(".a { min-height: var(--tag-h); font-size: var(--fs-badge); border-radius: var(--r-pill); }");
    none(".b { min-height: var(--btn-h); border-radius: var(--r-btn); }");
    none(".face { width: 40px; height: 40px; border-radius: var(--r-pill); }");
    none(".bar i { height: 8px; border-radius: var(--r-pill); }");
    none(".s { min-height: 48px; border-radius: var(--r-pill); /* token-exempt: 가입 단계 줄 */ }");
    none(".t { font-size: 11px; /* pill-size-exempt: 옛 이름도 받는다 */ }");
  });

  it("공용 부품 정의(base.css)에도 숫자·#값이 없다 — 운영자 화면 값은 사유를 단 줄만", () => {
    const found = findTokenViolations(readFileSync(join(__dirname, "base.css"), "utf8"));
    expect(found, `base.css 에서 토큰 대신 숫자로 적은 곳 ${found.length}개:\n${found.join("\n")}`).toEqual([]);
  });

  it("「운영자 화면 값」으로 뺀 base.css 규칙은 운영자 밖에서 토큰 규칙이 실제로 덮는다", () => {
    const css = readFileSync(join(__dirname, "base.css"), "utf8");
    const missing = findUncoveredAdminValues(css);
    expect(missing, `운영자 밖을 덮는 규칙이 없는 부품:\n${missing.join("\n")}`).toEqual([]);
  });

  it("덮는 규칙 확인이 실제로 잡는다 — 덮는 규칙을 지운 경우", () => {
    const exempt = ".btn { /* token-exempt: 운영자 화면 값 — x */ min-height: 48px; border-radius: var(--r-btn); }";
    expect(findUncoveredAdminValues(exempt)).toEqual([".btn"]);
    expect(findUncoveredAdminValues(`${exempt}\n.btn:where(:not(.admin-area *)) { min-height: var(--btn-h); }`)).toEqual([]);
  });

  it("화면 CSS 에 숫자·#값으로 적은 크기·글자·색·모서리가 없다", () => {
    const found: string[] = [];
    for (const f of moduleCssFiles(SRC)) {
      const rel = relative(SRC, f).replaceAll("\\", "/");
      // 운영자 화면·사무실 작업 화면(입고·검수·출고, 인쇄지)은 따로 정한 값
      if (/(^|\/)admin|\/office-|shared\/ui\/work\.module\.css$/.test(rel)) continue;
      for (const v of findTokenViolations(readFileSync(f, "utf8"))) found.push(`${rel}:${v}`);
    }
    expect(found, `토큰 대신 숫자로 적은 곳 ${found.length}개:\n${found.join("\n")}`).toEqual([]);
  });
});
