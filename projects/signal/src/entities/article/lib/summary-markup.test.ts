import { describe, expect, it } from "vitest";
import { parseSummaryMarkup, summaryPreviewText, tableToMarkup } from "./summary-markup";
import type { SummaryBlock } from "./summary-markup";

/** 블록 목록에서 해석된 글자를 모두 모은다 — "글자 그대로 남았나"를 볼 때 쓴다. */
function allText(blocks: SummaryBlock[]): string {
  const inl = (xs: { text: string }[]) => xs.map((x) => x.text).join("");
  return blocks
    .map((b) => {
      if (b.kind === "paragraph") return inl(b.inlines);
      if (b.kind === "list") return b.items.map(inl).join("\n");
      return [b.head, ...b.rows].map((r) => r.map(inl).join("|")).join("\n");
    })
    .join("\n\n");
}

describe("요약 서식 해석 — 허용 목록 넷 (content-safety INV-D7)", () => {
  it("INV-D7 (S14): 빈 줄로 나뉜 문단은 문단 둘이 된다", () => {
    const blocks = parseSummaryMarkup("첫 문단이다.\n\n둘째 문단이다.");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "paragraph"]);
  });

  it("INV-D7 (S14): 문단 안의 줄바꿈은 한 문단으로 잇는다", () => {
    const blocks = parseSummaryMarkup("한 줄\n다음 줄");
    expect(blocks).toHaveLength(1);
    expect(allText(blocks)).toBe("한 줄 다음 줄");
  });

  it("INV-D7 (S14): `**굵게**` 는 굵은 조각이 된다", () => {
    const [p] = parseSummaryMarkup("가격은 **100만 원**이다.");
    expect(p.kind).toBe("paragraph");
    if (p.kind !== "paragraph") return;
    expect(p.inlines).toEqual([
      { kind: "text", text: "가격은 " },
      { kind: "bold", text: "100만 원" },
      { kind: "text", text: "이다." },
    ]);
  });

  it("INV-D7 (S14): 짝이 안 맞는 `**` 는 글자 그대로다", () => {
    const [p] = parseSummaryMarkup("별표 ** 하나만");
    if (p.kind !== "paragraph") throw new Error("문단이어야 한다");
    expect(p.inlines).toEqual([{ kind: "text", text: "별표 ** 하나만" }]);
  });

  it("INV-D7 (S14): `- ` 로 시작하는 줄들은 점 목록이 된다", () => {
    const [l] = parseSummaryMarkup("- 하나\n- **둘**");
    expect(l.kind).toBe("list");
    if (l.kind !== "list") return;
    expect(l.items).toEqual([
      [{ kind: "text", text: "하나" }],
      [{ kind: "bold", text: "둘" }],
    ]);
  });

  it("INV-D7 (S14): 머리행 + 구분행 + 본문 행인 3열 표는 표가 된다", () => {
    const [t] = parseSummaryMarkup(
      "| 모델 | 컨텍스트 | 가격 |\n| --- | --- | --- |\n| A | 20만 | **$3** |\n| B | 100만 | $5 |",
    );
    expect(t.kind).toBe("table");
    if (t.kind !== "table") return;
    expect(t.head.map((c) => c[0].text)).toEqual(["모델", "컨텍스트", "가격"]);
    expect(t.rows).toHaveLength(2);
    // 셀 안에서는 굵게만 해석한다
    expect(t.rows[0][2]).toEqual([{ kind: "bold", text: "$3" }]);
  });

  it("INV-D7 (S14): 문단 · 목록 · 표가 섞여도 순서대로 나온다", () => {
    const blocks = parseSummaryMarkup(
      "요약 문단.\n\n- 항목\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    );
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "list", "table"]);
  });
});

describe("요약 서식 해석 — 허용 목록 밖은 글자 그대로 (INV-D7 실패경로)", () => {
  const hostile = [
    "[클릭](javascript:alert(1))",
    "![x](https://ex.com/a.png)",
    "# 제목",
    "<script>alert(1)</script>",
    "https://evil.example",
    "1. 번호 목록",
    "> 인용",
  ];

  it.each(hostile)("INV-D7 (S15): %s 는 문단 글자로만 남는다", (input) => {
    const blocks = parseSummaryMarkup(input);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("paragraph");
    expect(allText(blocks)).toBe(input);
  });

  it("INV-D7 (S16): 열 4개짜리 표는 표가 아니다", () => {
    const src = "| a | b | c | d |\n|---|---|---|---|\n| 1 | 2 | 3 | 4 |";
    const blocks = parseSummaryMarkup(src);
    expect(blocks.some((b) => b.kind === "table")).toBe(false);
    expect(allText(blocks)).toContain("| a | b | c | d |");
  });

  it("INV-D7 (S16): 열 1개짜리 표는 표가 아니다", () => {
    const blocks = parseSummaryMarkup("| a |\n|---|\n| 1 |");
    expect(blocks.some((b) => b.kind === "table")).toBe(false);
  });

  it("INV-D7 (S16): 본문 행 9개짜리 표는 표가 아니다", () => {
    const rows = Array.from({ length: 9 }, (_, i) => `| r${i} | v |`).join("\n");
    const blocks = parseSummaryMarkup(`| k | v |\n|---|---|\n${rows}`);
    expect(blocks.some((b) => b.kind === "table")).toBe(false);
  });

  it("INV-D7 (S16): 본문 행 8개는 경계 안이라 표다", () => {
    const rows = Array.from({ length: 8 }, (_, i) => `| r${i} | v |`).join("\n");
    const blocks = parseSummaryMarkup(`| k | v |\n|---|---|\n${rows}`);
    expect(blocks[0].kind).toBe("table");
  });

  it("INV-D7 (S16): 구분행이 없으면 표가 아니다", () => {
    const blocks = parseSummaryMarkup("| a | b |\n| 1 | 2 |");
    expect(blocks.some((b) => b.kind === "table")).toBe(false);
  });

  it("INV-D7: 굵게 안의 링크 표기도 글자 그대로다", () => {
    const [p] = parseSummaryMarkup("**[x](javascript:alert(1))**");
    if (p.kind !== "paragraph") throw new Error("문단이어야 한다");
    expect(p.inlines).toEqual([{ kind: "bold", text: "[x](javascript:alert(1))" }]);
  });

  it("빈 요약은 블록이 없다", () => {
    expect(parseSummaryMarkup("  \n\n ")).toEqual([]);
  });
});

describe("카드 미리보기 — 서식 기호를 벗긴 첫 문단 (INV-D7)", () => {
  it("INV-D7: 굵게 기호를 벗긴다", () => {
    expect(summaryPreviewText("가격은 **100만 원**이다.\n\n둘째")).toBe("가격은 100만 원이다.");
  });

  it("INV-D7: 표로 시작하면 표를 건너뛰고 다음 문단을 쓴다", () => {
    expect(summaryPreviewText("| a | b |\n|---|---|\n| 1 | 2 |\n\n본문 문단.")).toBe("본문 문단.");
  });

  it("INV-D7: 목록뿐이면 항목을 이어 쓴다", () => {
    expect(summaryPreviewText("- 하나\n- **둘**")).toBe("하나 · 둘");
  });

  it("INV-D7 실패경로: 서식 없는 옛 요약은 그대로다", () => {
    expect(summaryPreviewText("옛 요약 한 덩어리.")).toBe("옛 요약 한 덩어리.");
  });
});

describe("모델이 따로 준 표를 요약 표기로 옮긴다 (INV-D7)", () => {
  it("INV-D7: 머리행·행이 맞으면 해석기가 표로 읽는 표기가 된다", () => {
    const md = tableToMarkup({ head: ["모델", "입력", "출력"], rows: [["솔", "$2", "$10"], ["루나", "$0.1", "$0.5"]] });
    expect(md).not.toBeNull();
    const [t] = parseSummaryMarkup(md ?? "");
    expect(t.kind).toBe("table");
  });

  it("INV-D7 실패경로: 칸 안의 `|` 와 줄바꿈은 표를 깨지 못한다", () => {
    const md = tableToMarkup({ head: ["a", "b"], rows: [["x | y", "줄\n바꿈"]] });
    const [t] = parseSummaryMarkup(md ?? "");
    expect(t.kind).toBe("table");
    if (t.kind !== "table") return;
    expect(t.rows[0]).toHaveLength(2);
  });

  it.each([
    ["열 4개", { head: ["a", "b", "c", "d"], rows: [["1", "2", "3", "4"]] }],
    ["열 1개", { head: ["a"], rows: [["1"]] }],
    ["행 9개", { head: ["a", "b"], rows: Array.from({ length: 9 }, () => ["1", "2"]) }],
    ["행 0개", { head: ["a", "b"], rows: [] }],
    ["행마다 열 수가 다름", { head: ["a", "b"], rows: [["1"]] }],
    ["문자열이 아닌 칸", { head: ["a", "b"], rows: [[1, 2]] }],
    ["빈 칸", { head: ["a", ""], rows: [["1", "2"]] }],
    ["모양이 아님", "표"],
    ["null", null],
  ])("INV-D7 실패경로: %s 이면 표를 버린다", (_label, value) => {
    expect(tableToMarkup(value)).toBeNull();
  });
});
