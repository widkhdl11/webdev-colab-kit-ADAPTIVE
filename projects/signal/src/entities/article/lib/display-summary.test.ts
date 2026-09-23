import { describe, expect, it } from "vitest";
import { displaySummary } from "./display-summary";

const POINTS = ["항목1", "항목2"];

/** INV-S2: AI 요약이 없으면 출처가 준 요약글을 대신 보여준다. 어느 쪽인지도 함께 알린다. */
describe("displaySummary", () => {
  it("INV-S2: AI 요약이 있으면 그것을 쓰고 AI 라고 알린다", () => {
    expect(
      displaySummary({ summary: "AI 요약", sourceExcerpt: "출처 글", summaryPoints: POINTS }),
    ).toEqual({ text: "AI 요약", isAi: true, points: POINTS, oneLine: null, isLegacy: true });
  });

  it("INV-S2 (S19): AI 요약이 없으면 출처 글을 쓰고 AI 가 아니라고 알린다", () => {
    // 여기서 isAi 를 true 로 두면 "AI 요약" 표시가 거짓말이 된다.
    expect(
      displaySummary({ summary: "", sourceExcerpt: "출처 글", summaryPoints: [] }),
    ).toEqual({ text: "출처 글", isAi: false, points: [], oneLine: null, isLegacy: false });
  });

  it("INV-S7 (S26) 실패경로: 출처 글을 보여줄 때는 핵심 항목을 딸려 보내지 않는다", () => {
    // 핵심 항목은 **우리가** 뽑은 것이다. 출처 글 옆에 붙이면 누가 쓴 것인지가 섞인다.
    // summaryPoints 가 남아 있는 상태(요약만 지워진 항목)에서도 비어야 한다.
    const out = displaySummary({
      summary: "",
      sourceExcerpt: "출처 글",
      summaryPoints: POINTS,
    });
    expect(out).toEqual({ text: "출처 글", isAi: false, points: [], oneLine: null, isLegacy: false });
  });

  it("INV-S2 실패경로: 둘 다 없으면 null (빈 박스를 그리지 않는다)", () => {
    expect(displaySummary({ summary: "", sourceExcerpt: null, summaryPoints: [] })).toBeNull();
    expect(
      displaySummary({ summary: "   ", sourceExcerpt: "  ", summaryPoints: POINTS }),
    ).toBeNull();
  });

  it("공백뿐인 AI 요약은 없는 것으로 보고 출처 글로 내려간다", () => {
    expect(
      displaySummary({ summary: "   ", sourceExcerpt: "출처 글", summaryPoints: [] }),
    ).toEqual({ text: "출처 글", isAi: false, points: [], oneLine: null, isLegacy: false });
  });

  it("INV-S8: 한 줄 요약이 있는 AI 요약은 새 형식이다", () => {
    expect(
      displaySummary({ summary: "한 줄.", oneLine: " 한 줄. ", sourceExcerpt: null, summaryPoints: POINTS }),
    ).toMatchObject({ isAi: true, oneLine: "한 줄.", isLegacy: false });
  });

  it("INV-S2 실패경로: 출처 글을 보여줄 때는 남아 있는 한 줄 요약을 딸려 보내지 않는다", () => {
    // 요약만 지워지고 one_line 이 남은 항목 — 출처 글 화면에 우리 문장이 서면 누가 쓴 것인지가 섞인다.
    expect(
      displaySummary({ summary: "", oneLine: "우리 문장.", sourceExcerpt: "출처 글", summaryPoints: [] }),
    ).toMatchObject({ isAi: false, oneLine: null, isLegacy: false });
  });

  it("공백뿐인 한 줄 요약은 없는 것으로 보고 옛 형식으로 그린다", () => {
    expect(
      displaySummary({ summary: "옛 문단.", oneLine: "  ", sourceExcerpt: null, summaryPoints: [] }),
    ).toMatchObject({ oneLine: null, isLegacy: true });
  });
});
