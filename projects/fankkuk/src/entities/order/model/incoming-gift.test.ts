import { describe, expect, it } from "vitest";
import { incomingNoteOf, type IncomingStage } from "./incoming-gift";

describe("크리에이터 메인 진행 중인 선물 문구 (office-workflow INV-W9 화면 표시)", () => {
  it("보관 상자가 없으면 단계 문구만", () => {
    expect(incomingNoteOf({ stage: "paid", inspection: null })).toBe("사무실 도착을 기다려요.");
    expect(incomingNoteOf({ stage: "shipped", inspection: "passed" })).toBe("출고했어요.");
  });

  it("보관 상자가 있고 단계가 입고면 보관 문구", () => {
    expect(incomingNoteOf({ stage: "received", inspection: "held" })).toBe("추적 장치가 나와 사무실에 보관하고 있어요.");
  });

  it("보관 상자가 있어도 입고가 아닌 단계면 단계 문구 뒤에 「상자 일부 보관」 — 보관 문구로 고정하지 않는다", () => {
    const cases: [IncomingStage, string][] = [
      ["inspected", "검수를 마쳤어요. 상자 일부 보관"],
      ["shipped", "출고했어요. 상자 일부 보관"],
      ["in_transit", "지금 가고 있어요. 상자 일부 보관"],
    ];
    for (const [stage, text] of cases) expect(incomingNoteOf({ stage, inspection: "held" })).toBe(text);
  });
});
