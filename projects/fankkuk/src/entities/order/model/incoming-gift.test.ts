import { describe, expect, it } from "vitest";
import { incomingNoteOf, type IncomingStage } from "./incoming-gift";

// 추적기 상자도 보관 없이 바로 반송 대기로 가므로(2026-10-12 문제집 D2) 「보관」 검수 결과는 없다 — 문구는 단계만 따른다.

describe("크리에이터 메인 진행 중인 선물 문구 (office-workflow INV-W9 화면 표시)", () => {
  it("단계 문구만 — 검수 결과가 통과여도 같다", () => {
    expect(incomingNoteOf({ stage: "paid", inspection: null })).toBe("사무실 도착을 기다려요.");
    expect(incomingNoteOf({ stage: "shipped", inspection: "passed" })).toBe("출고했어요.");
    const cases: [IncomingStage, string][] = [
      ["received", "사무실에 도착했어요. 검수를 기다려요."],
      ["inspected", "검수를 마쳤어요."],
      ["in_transit", "지금 가고 있어요."],
    ];
    for (const [stage, text] of cases) expect(incomingNoteOf({ stage, inspection: "passed" })).toBe(text);
  });

  it("보관 문구는 어느 단계에도 없다", () => {
    for (const stage of ["paid", "received", "inspected", "shipped", "in_transit"] as const) {
      expect(incomingNoteOf({ stage, inspection: "passed" })).not.toContain("보관");
    }
  });
});
