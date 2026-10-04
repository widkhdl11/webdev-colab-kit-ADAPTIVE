import { describe, expect, it } from "vitest";
import { allowedOutcomes, inspectionResultOf, inspectionResultShape, outcomeRestriction } from "./inspection";

describe("검수 기록 (office-workflow INV-W4)", () => {
  it("INV-W4: 팬 선물 — 블루투스·RF 중 하나라도 나오면 「보관」만 고를 수 있다", () => {
    expect(allowedOutcomes({ kind: "gift", bluetooth: "found", rf: "clear", metal: "clear" })).toEqual(["hold"]);
    expect(allowedOutcomes({ kind: "gift", bluetooth: "clear", rf: "found", metal: "found" })).toEqual(["hold"]);
  });

  it("INV-W4: 팬 선물 — 추적 장치가 없으면 통과·반송만(보관은 추적 장치가 나왔을 때만)", () => {
    expect(allowedOutcomes({ kind: "gift", bluetooth: "clear", rf: "clear", metal: "clear" })).toEqual(["pass", "return"]);
    expect(allowedOutcomes({ kind: "gift", bluetooth: "clear", rf: "clear", metal: "found" })).toEqual(["pass", "return"]);
  });

  it("INV-W4: 역조공 — 겉면·금지 물품 중 하나라도 걸리면 「반송」만, 아니면 통과·반송", () => {
    expect(allowedOutcomes({ kind: "revgift", surface: "found", prohibited: "clear" })).toEqual(["return"]);
    expect(allowedOutcomes({ kind: "revgift", surface: "clear", prohibited: "found" })).toEqual(["return"]);
    expect(allowedOutcomes({ kind: "revgift", surface: "clear", prohibited: "clear" })).toEqual(["pass", "return"]);
  });

  it("INV-W4: 맞는 기록은 받는다", () => {
    expect(inspectionResultShape.safeParse({ bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" }).success).toBe(true);
    expect(inspectionResultShape.safeParse({ bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" }).success).toBe(true);
    expect(inspectionResultShape.safeParse({ surface: "clear", prohibited: "clear", outcome: "pass" }).success).toBe(true);
  });

  it("INV-W4 (실패경로): 결과와 맞지 않는 결론·섞인 칸·모르는 값은 받지 않는다", () => {
    const bad: unknown[] = [
      { bluetooth: "found", rf: "clear", metal: "clear", outcome: "pass" }, // 추적 장치인데 통과
      { bluetooth: "found", rf: "clear", metal: "clear", outcome: "return" }, // 추적 장치인데 반송
      { bluetooth: "clear", rf: "clear", metal: "clear", outcome: "hold" }, // 추적 장치 없는데 보관
      { surface: "found", prohibited: "clear", outcome: "pass" },
      { surface: "clear", prohibited: "clear", outcome: "hold" },
      { bluetooth: "clear", rf: "clear", metal: "clear", surface: "clear", outcome: "pass" }, // 섞인 칸
      { bluetooth: "maybe", rf: "clear", metal: "clear", outcome: "pass" },
      { bluetooth: "clear", rf: "clear", outcome: "pass" },
      null,
    ];
    for (const value of bad) expect(inspectionResultShape.safeParse(value).success).toBe(false);
  });
});

describe("검수 결론 고르기 (office-workflow INV-W4)", () => {
  it("INV-W4: 고른 결론이 허용 밖이면 허용된 첫 결론으로 — 역조공 보관은 보낼 수 없다", () => {
    expect(inspectionResultOf({ kind: "gift", bluetooth: "found", rf: "clear", metal: "clear" }, "pass")).toEqual({ bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" });
    expect(inspectionResultOf({ kind: "gift", bluetooth: "clear", rf: "clear", metal: "clear" }, "return")).toEqual({ bluetooth: "clear", rf: "clear", metal: "clear", outcome: "return" });
    expect(inspectionResultOf({ kind: "revgift", surface: "clear", prohibited: "clear" }, "hold")).toEqual({ surface: "clear", prohibited: "clear", outcome: "pass" });
    expect(inspectionResultOf({ kind: "revgift", surface: "found", prohibited: "clear" }, "pass")).toEqual({ surface: "found", prohibited: "clear", outcome: "return" });
  });

  it("INV-W4: 만든 기록은 언제나 서버 검사를 통과한다", () => {
    for (const checks of [
      { kind: "gift", bluetooth: "found", rf: "found", metal: "found" },
      { kind: "gift", bluetooth: "clear", rf: "clear", metal: "found" },
      { kind: "revgift", surface: "clear", prohibited: "found" },
    ] as const) {
      for (const o of ["pass", "return", "hold"] as const) expect(inspectionResultShape.safeParse(inspectionResultOf(checks, o)).success).toBe(true);
    }
  });

  it("INV-W4: 선택지 제한 — 추적 장치면 보관만, 역조공 걸림이면 반송만, 아니면 제한 없음", () => {
    expect(outcomeRestriction({ kind: "gift", bluetooth: "clear", rf: "found", metal: "clear" })).toBe("hold_only");
    expect(outcomeRestriction({ kind: "revgift", surface: "clear", prohibited: "found" })).toBe("return_only");
    expect(outcomeRestriction({ kind: "gift", bluetooth: "clear", rf: "clear", metal: "found" })).toBeNull();
    expect(outcomeRestriction({ kind: "revgift", surface: "clear", prohibited: "clear" })).toBeNull();
  });
});
