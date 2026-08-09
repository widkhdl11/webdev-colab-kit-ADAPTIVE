import { describe, expect, it } from "vitest";
import { displaySummary } from "./display-summary";

/** INV-S2: AI 요약이 없으면 출처가 준 요약글을 대신 보여준다. 어느 쪽인지도 함께 알린다. */
describe("displaySummary", () => {
  it("INV-S2: AI 요약이 있으면 그것을 쓰고 AI 라고 알린다", () => {
    expect(displaySummary({ summary: "AI 요약", sourceExcerpt: "출처 글" })).toEqual({
      text: "AI 요약",
      isAi: true,
    });
  });

  it("INV-S2 (S19): AI 요약이 없으면 출처 글을 쓰고 AI 가 아니라고 알린다", () => {
    // 여기서 isAi 를 true 로 두면 "AI 요약" 표시가 거짓말이 된다.
    expect(displaySummary({ summary: "", sourceExcerpt: "출처 글" })).toEqual({
      text: "출처 글",
      isAi: false,
    });
  });

  it("INV-S2 실패경로: 둘 다 없으면 null (빈 박스를 그리지 않는다)", () => {
    expect(displaySummary({ summary: "", sourceExcerpt: null })).toBeNull();
    expect(displaySummary({ summary: "   ", sourceExcerpt: "  " })).toBeNull();
  });

  it("공백뿐인 AI 요약은 없는 것으로 보고 출처 글로 내려간다", () => {
    expect(displaySummary({ summary: "   ", sourceExcerpt: "출처 글" })).toEqual({
      text: "출처 글",
      isAi: false,
    });
  });
});
