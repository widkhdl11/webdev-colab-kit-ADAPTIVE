import { describe, expect, it } from "vitest";
import { blockTexts, chipTags, findIds, formatUpdated, markParts, queryWords, sectionItems, summaryTargets, tocGroupsOf } from "./doc-nav";
import { faqDoc } from "./faq-doc";
import type { LegalSection } from "./legal-doc";

// 문서형 페이지 찾기 도구의 계산(docs/ux/document-pages.md 원칙 ①~⑥, 차이 목록 C4·C5·C7·C8).

const prices = {
  small: { priceKrw: 6111, revgiftPriceKrw: 5111, returnShippingKrw: 4111 },
  medium: { priceKrw: 8222, revgiftPriceKrw: 7222, returnShippingKrw: 5222 },
  large: { priceKrw: 9333, revgiftPriceKrw: 8333, returnShippingKrw: 6333 },
} as const;

const sections: readonly LegalSection[] = [
  { id: "plain", title: "제1조 목적", blocks: [{ kind: "text", text: "이 약관은 목적을 정합니다." }] },
  { id: "rows", title: "환불 표", blocks: [{ kind: "rows", rows: [{ title: "입고 전", fields: [["돌려받는 금액", "반송택배비만큼 뺀 금액"]] }] }] },
  { id: "defs", title: "정의", blocks: [{ kind: "defs", items: [["보관소", "상자를 맡겨 두는 곳을 말합니다."]] }] },
  { id: "prices", title: "요금", blocks: [{ kind: "prices", columns: ["선물"], rows: [{ name: "소형", rule: "세변합계 80cm", amounts: ["6,111원"] }] }] },
  { id: "stages", title: "단계", blocks: [{ kind: "stages", title: "진행 상황", items: ["입고", "검수"], note: "덧붙임줄" }] },
  { id: "list", title: "목록", blocks: [{ kind: "list", items: ["점목록글"] }, { kind: "steps", items: ["차례목록글"] }] },
];

describe("검색이 읽는 글자 — 모든 글 모양(C4)", () => {
  const items = sectionItems(sections);
  it.each([
    ["rows 이름·값", "반송택배비", "rows"],
    ["rows 줄 제목", "입고 전", "rows"],
    ["defs 낱말", "보관소", "defs"],
    ["defs 뜻", "맡겨 두는", "defs"],
    ["prices 기준", "세변합계", "prices"],
    ["prices 금액", "6,111원", "prices"],
    ["stages 덧붙임", "덧붙임줄", "stages"],
    ["list", "점목록글", "list"],
    ["steps", "차례목록글", "list"],
    ["조 제목", "목적", "plain"],
  ])("%s 안의 글자로 그 조를 찾는다", (_, q, id) => {
    expect(findIds(items, queryWords(q))).toEqual([id]);
  });

  it("낱말 여럿은 모두 들어 있는 조만, 대소문자 가리지 않음", () => {
    const xs = sectionItems([
      { id: "a", title: "A", blocks: [{ kind: "text", text: "Kakao 인증서 서명" }] },
      { id: "b", title: "B", blocks: [{ kind: "text", text: "인증서만" }] },
    ]);
    expect(findIds(xs, queryWords("  kakao   인증서 "))).toEqual(["a"]);
    expect(findIds(xs, queryWords("인증서"))).toEqual(["a", "b"]);
    expect(findIds(xs, queryWords("   "))).toEqual([]);
  });

  it("blockTexts 는 요금 열 이름까지 돌려준다", () => {
    expect(blockTexts({ kind: "prices", columns: ["선물", "역조공"], rows: [] })).toEqual(["선물", "역조공"]);
  });
});

describe("찾은 낱말 자리 나누기(<mark>)", () => {
  it("낱말 자리만 hit, 나머지는 그대로 이어 붙이면 원문", () => {
    const parts = markParts("상자 요금과 상자 크기", ["상자"]);
    expect(parts).toEqual([
      { text: "상자", hit: true },
      { text: " 요금과 ", hit: false },
      { text: "상자", hit: true },
      { text: " 크기", hit: false },
    ]);
  });
  it("긴 낱말을 먼저, 정규식 글자는 글자 그대로", () => {
    expect(markParts("a.b 상자요금", ["상자", "상자요금", "a.b"]).filter((p) => p.hit).map((p) => p.text)).toEqual(["a.b", "상자요금"]);
    expect(markParts("axb", ["a.b"])).toEqual([{ text: "axb", hit: false }]);
  });
  it("낱말이 없으면 통째로 하나", () => {
    expect(markParts("글", [])).toEqual([{ text: "글", hit: false }]);
  });
});

describe("분류 칩 차례(C5)", () => {
  const items = [{ tags: ["환불", "팬"] }, { tags: [] }, { tags: ["크리에이터", "환불"] }];
  it("tagOrder 가 없으면 조에 처음 나온 차례", () => {
    expect(chipTags(items)).toEqual(["환불", "팬", "크리에이터"]);
  });
  it("tagOrder 가 있으면 그 차례 — 조에 없는 이름은 빼고, 빠진 이름은 뒤에 등장 순", () => {
    expect(chipTags(items, ["크리에이터", "결제", "팬"])).toEqual(["크리에이터", "팬", "환불"]);
  });
  it("분류가 하나도 없으면 빈 목록(칩 줄을 그리지 않는다)", () => {
    expect(chipTags([{ tags: [] }])).toEqual([]);
  });
});

describe("요약 줄 → 조(C7)", () => {
  const ids = ["a", "b", "c"];
  it("summary 와 길이가 같으면 줄마다 조 id", () => {
    expect(summaryTargets(["1", "2", "3"], ["c", "a", "b"], ids)).toEqual(["c", "a", "b"]);
  });
  it("길이가 다르면 엇갈려 잇지 않고 전부 링크 없음", () => {
    expect(summaryTargets(["1", "2", "3"], ["a", "b"], ids)).toEqual([null, null, null]);
    expect(summaryTargets(["1", "2", "3"], ["a", "b", "c", "a"], ids)).toEqual([null, null, null]);
  });
  it("없는 조 id 는 그 줄만 링크 없음, summaryLinks 가 없으면 전부 없음", () => {
    expect(summaryTargets(["1", "2", "3"], ["a", "zz", "c"], ids)).toEqual(["a", null, "c"]);
    expect(summaryTargets(["1", "2", "3"], undefined, ids)).toEqual([null, null, null]);
  });
});

describe("목차 묶음 · 최종 수정일", () => {
  it("묶음 없는 글은 이름 없는 묶음 하나, 묶음에 없는 조는 맨 뒤로", () => {
    expect(tocGroupsOf({ sections }).map((g) => [g.title, g.items.length])).toEqual([[null, sections.length]]);
    const g = tocGroupsOf({ sections, tocGroups: [{ title: "앞", ids: ["rows", "nope"] }] });
    expect(g[0]).toEqual({ title: "앞", items: [{ id: "rows", label: "환불 표" }] });
    expect(g[1]?.items.map((i) => i.id)).toEqual(["plain", "defs", "prices", "stages", "list"]);
  });
  it("「YYYY-MM-DD」 → 「YYYY.MM.DD」, 다른 글자는 그대로", () => {
    expect(formatUpdated("2026-10-23")).toBe("2026.10.23");
    expect(formatUpdated("10월")).toBe("10월");
  });
});

describe("자주 묻는 질문 고정 주소(C8)", () => {
  it("질문마다 영문 id 가 있고 겹치지 않으며 주소에 그대로 쓸 수 있다", () => {
    const ids = faqDoc(prices).items.map((f) => f.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});
