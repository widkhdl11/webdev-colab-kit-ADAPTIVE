import { describe, expect, it } from "vitest";
import { allowedOutcomes, inspectionResultOf, inspectionResultShape, outcomeRestriction, withoutStaleVerdict, type GiftChecks } from "./inspection";

// 2026-10-12 문제집 D2: 블루투스·RF 반응이 나오면 직원이 위치 추적기인지 판정한다. 추적기면 「추적기 반송」(DB 값 hold — 바로 반송 대기),
// 「추적기 아님」이면 크리에이터에게 받을지 묻는다(DB 값 confirm — 2026-10-12 (2) D3 ②) 또는 반송. 판정 값은 검수 기록에 남는다(tracker_verdict).

const gift = (over: Partial<GiftChecks> = {}): GiftChecks => ({ kind: "gift", bluetooth: "clear", rf: "clear", metal: "clear", trackerVerdict: null, ...over });

describe("검수 기록 (office-workflow INV-W4)", () => {
  it("INV-W4 (S4c): 팬 선물 — 반응이 있고 「추적기」로 판정하면 「추적기 반송」만 고를 수 있다", () => {
    expect(allowedOutcomes(gift({ bluetooth: "found", trackerVerdict: "tracker" }))).toEqual(["hold"]);
    expect(allowedOutcomes(gift({ rf: "found", metal: "found", trackerVerdict: "tracker" }))).toEqual(["hold"]);
  });

  it("INV-W4 (S4g): 팬 선물 — 반응이 있고 「추적기 아님」이면 바로 통과하지 않고 「크리에이터 확인」·반송(2026-10-12 (2) D3 ②)", () => {
    expect(allowedOutcomes(gift({ bluetooth: "found", trackerVerdict: "not_tracker" }))).toEqual(["confirm", "return"]);
    expect(allowedOutcomes(gift({ rf: "found", metal: "found", trackerVerdict: "not_tracker" }))).toEqual(["confirm", "return"]);
  });

  it("INV-W4 (S4g, 실패경로): 반응이 있는데 판정을 하지 않았으면 고를 수 있는 결론이 없다", () => {
    expect(allowedOutcomes(gift({ bluetooth: "found" }))).toEqual([]);
    expect(inspectionResultOf(gift({ bluetooth: "found" }), "pass")).toBeNull();
    expect(outcomeRestriction(gift({ bluetooth: "found" }))).toBe("needs_verdict");
  });

  it("INV-W4: 팬 선물 — 반응이 없으면 통과·반송만(추적기 반송·크리에이터 확인은 반응이 나왔을 때만)", () => {
    expect(allowedOutcomes(gift())).toEqual(["pass", "return"]);
    expect(allowedOutcomes(gift({ metal: "found" }))).toEqual(["pass", "return"]);
  });

  it("INV-W4: 역조공 — 겉면·금지 물품 중 하나라도 걸리면 「반송」만, 아니면 통과·반송", () => {
    expect(allowedOutcomes({ kind: "revgift", surface: "found", prohibited: "clear" })).toEqual(["return"]);
    expect(allowedOutcomes({ kind: "revgift", surface: "clear", prohibited: "found" })).toEqual(["return"]);
    expect(allowedOutcomes({ kind: "revgift", surface: "clear", prohibited: "clear" })).toEqual(["pass", "return"]);
  });

  it("INV-W4: 맞는 기록은 받는다 — 반응이 있으면 판정 값이 같이 간다", () => {
    for (const ok of [
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold" },
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" },
      { bluetooth: "clear", rf: "found", metal: "clear", tracker_verdict: "not_tracker", outcome: "return" },
      { bluetooth: "clear", rf: "clear", metal: "found", outcome: "return" },
      { surface: "clear", prohibited: "clear", outcome: "pass" },
    ]) expect([ok, inspectionResultShape.safeParse(ok).success]).toEqual([ok, true]);
  });

  it("INV-W4 (S4g, 실패경로): 판정과 맞지 않는 결론·판정 빠짐·없는 반응의 판정·섞인 칸·모르는 값은 받지 않는다", () => {
    const bad: unknown[] = [
      { bluetooth: "found", rf: "clear", metal: "clear", outcome: "hold" }, // 반응이 있는데 판정 없음
      { bluetooth: "found", rf: "clear", metal: "clear", outcome: "pass" },
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "pass" }, // 추적기인데 통과
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "return" }, // 추적기인데 일반 반송
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "hold" }, // 추적기 아닌데 추적기 반송
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "pass" }, // 추적기 아닌데 바로 통과(D3 ②)
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "confirm" }, // 추적기인데 크리에이터 확인
      { bluetooth: "clear", rf: "clear", metal: "clear", outcome: "confirm" }, // 반응이 없는데 크리에이터 확인
      { surface: "clear", prohibited: "clear", outcome: "confirm" }, // 역조공에 크리에이터 확인
      { bluetooth: "clear", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "pass" }, // 반응이 없는데 판정
      { bluetooth: "clear", rf: "clear", metal: "clear", outcome: "hold" },
      { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "maybe", outcome: "pass" },
      { surface: "found", prohibited: "clear", outcome: "pass" },
      { surface: "clear", prohibited: "clear", outcome: "hold" },
      { surface: "clear", prohibited: "clear", tracker_verdict: "not_tracker", outcome: "pass" },
      { bluetooth: "clear", rf: "clear", metal: "clear", surface: "clear", outcome: "pass" }, // 섞인 칸
      { bluetooth: "maybe", rf: "clear", metal: "clear", outcome: "pass" },
      { bluetooth: "clear", rf: "clear", outcome: "pass" },
      null,
    ];
    for (const value of bad) expect([value, inspectionResultShape.safeParse(value).success]).toEqual([value, false]);
  });
});

describe("검수 결론 고르기 (office-workflow INV-W4)", () => {
  it("INV-W4: 고른 결론이 허용 밖이면 허용된 첫 결론으로 — 역조공 추적기 반송은 보낼 수 없다", () => {
    expect(inspectionResultOf(gift({ bluetooth: "found", trackerVerdict: "tracker" }), "pass")).toEqual({
      bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "tracker", outcome: "hold",
    });
    expect(inspectionResultOf(gift({ bluetooth: "found", trackerVerdict: "not_tracker" }), "hold")).toEqual({
      bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm",
    });
    expect(inspectionResultOf(gift({ bluetooth: "found", trackerVerdict: "not_tracker" }), "pass")).toEqual({
      bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm",
    });
    expect(inspectionResultOf(gift(), "confirm")).toEqual({ bluetooth: "clear", rf: "clear", metal: "clear", outcome: "pass" });
    expect(inspectionResultOf(gift(), "return")).toEqual({ bluetooth: "clear", rf: "clear", metal: "clear", outcome: "return" });
    expect(inspectionResultOf({ kind: "revgift", surface: "clear", prohibited: "clear" }, "hold")).toEqual({ surface: "clear", prohibited: "clear", outcome: "pass" });
    expect(inspectionResultOf({ kind: "revgift", surface: "found", prohibited: "clear" }, "pass")).toEqual({ surface: "found", prohibited: "clear", outcome: "return" });
  });

  it("INV-W4: 반응이 없어진 뒤 남은 판정은 기록에 싣지 않는다", () => {
    expect(inspectionResultOf(gift({ trackerVerdict: "tracker" }), "pass")).toEqual({ bluetooth: "clear", rf: "clear", metal: "clear", outcome: "pass" });
  });

  it("INV-W4: 만든 기록은 언제나 서버 검사를 통과한다", () => {
    for (const checks of [
      gift({ bluetooth: "found", rf: "found", metal: "found", trackerVerdict: "tracker" }),
      gift({ bluetooth: "found", trackerVerdict: "not_tracker" }),
      gift({ metal: "found" }),
      gift({ trackerVerdict: "not_tracker" }),
      { kind: "revgift", surface: "clear", prohibited: "found" } as const,
    ]) {
      for (const o of ["pass", "return", "hold", "confirm"] as const) expect(inspectionResultShape.safeParse(inspectionResultOf(checks, o)).success).toBe(true);
    }
  });

  it("INV-W4: 선택지 제한 — 추적기면 추적기 반송만, 추적기 아님이면 크리에이터 확인·반송, 판정 전이면 판정부터, 역조공 걸림이면 반송만, 아니면 제한 없음", () => {
    expect(outcomeRestriction(gift({ rf: "found", trackerVerdict: "tracker" }))).toBe("tracker_only");
    expect(outcomeRestriction(gift({ rf: "found" }))).toBe("needs_verdict");
    expect(outcomeRestriction(gift({ rf: "found", trackerVerdict: "not_tracker" }))).toBe("creator_confirm");
    expect(outcomeRestriction({ kind: "revgift", surface: "clear", prohibited: "found" })).toBe("return_only");
    expect(outcomeRestriction(gift({ metal: "found" }))).toBeNull();
    expect(outcomeRestriction({ kind: "revgift", surface: "clear", prohibited: "clear" })).toBeNull();
  });

  it("INV-W4: 반응이 없어지면 남은 추적기 판정을 비운다 — 다시 반응이 나와도 판정은 기본값 없이 비어 있다", () => {
    expect(withoutStaleVerdict(gift({ trackerVerdict: "tracker" }))).toEqual(gift());
    expect(withoutStaleVerdict(gift({ trackerVerdict: "not_tracker" }))).toEqual(gift());
    // 반응이 남아 있으면 판정을 그대로 둔다
    expect(withoutStaleVerdict(gift({ bluetooth: "found", trackerVerdict: "tracker" }))).toEqual(gift({ bluetooth: "found", trackerVerdict: "tracker" }));
    expect(withoutStaleVerdict(gift({ rf: "found", trackerVerdict: "not_tracker" }))).toEqual(gift({ rf: "found", trackerVerdict: "not_tracker" }));
    const rev = { kind: "revgift", surface: "found", prohibited: "clear" } as const;
    expect(withoutStaleVerdict(rev)).toEqual(rev);
  });
});
