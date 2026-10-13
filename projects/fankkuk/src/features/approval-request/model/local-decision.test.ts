import { describe, expect, it } from "vitest";
import { applyDecision, decidedBelow, type LocalDecision } from "./local-decision";

// 같은 닉네임이라도 같은 팬인지는 화면이 모른다 — 서버가 돌려준 「함께 거절한 주문번호」로만 가린다.
const NONE: ReadonlySet<string> = new Set();

describe("applyDecision — 승인 요청 화면 안의 결정과 차단 전파", () => {
  it("결정한 줄에 그 결정을 적는다", () => {
    const next = applyDecision({}, "A1", { kind: "signing" }, NONE);
    expect(next.A1).toEqual({ kind: "signing" });
  });

  it("INV-D8: 서버가 함께 거절했다고 한 대기·서명 대기 줄이 막힌다", () => {
    const before: Record<string, LocalDecision> = { A2: { kind: "signing" } };
    const next = applyDecision(before, "A1", { kind: "declined", blocked: true }, new Set(["A2", "A3"]));
    expect(next.A1).toEqual({ kind: "declined", blocked: true });
    expect(next.A2).toEqual({ kind: "blocked_elsewhere" }); // 서명 대기였다
    expect(next.A3).toEqual({ kind: "blocked_elsewhere" }); // 아직 아무 결정도 없었다(대기)
  });

  it("INV-D8 S8c: 서버 목록에 없는 줄은 그대로 둔다 — 그사이 7일 반려됐거나 다른 팬의 줄이어도", () => {
    const next = applyDecision({ B1: { kind: "signing" } }, "A1", { kind: "declined", blocked: true }, new Set(["A2"]));
    expect(next.B1).toEqual({ kind: "signing" });
    expect(next.B2).toBeUndefined();
  });

  it("이미 처리된 줄은 그대로 둔다", () => {
    const next = applyDecision({ A4: { kind: "declined", blocked: false } }, "A1", { kind: "declined", blocked: true }, new Set(["A4"]));
    expect(next.A4).toEqual({ kind: "declined", blocked: false });
  });

  it("결정한 줄이 목록에 섞여 와도 그 줄의 결정을 덮지 않는다", () => {
    const next = applyDecision({}, "A1", { kind: "declined", blocked: true }, new Set(["A1"]));
    expect(next.A1).toEqual({ kind: "declined", blocked: true });
  });

  it("넘겨받은 기록을 고치지 않고 새 기록을 돌려준다", () => {
    const before: Record<string, LocalDecision> = {};
    applyDecision(before, "A1", { kind: "declined", blocked: true }, new Set(["A2"]));
    expect(before).toEqual({});
  });
});

describe("decidedBelow — 처리한 요청 구간", () => {
  const decided = [{ orderNo: "A1" }, { orderNo: "B1" }];

  it("이 화면에서 방금 처리한 줄은 위 구간에 남으니 아래에서는 뺀다", () => {
    const states: Record<string, LocalDecision> = { A1: { kind: "declined", blocked: false } };
    expect(decidedBelow(decided, states).map((d) => d.orderNo)).toEqual(["B1"]);
  });

  it("함께 막힌 줄도 위 구간에 남으니 뺀다", () => {
    const states: Record<string, LocalDecision> = { B1: { kind: "blocked_elsewhere" } };
    expect(decidedBelow(decided, states).map((d) => d.orderNo)).toEqual(["A1"]);
  });

  it("이 화면에서 건드리지 않은 처리 기록은 그대로 보인다", () => {
    expect(decidedBelow(decided, {}).map((d) => d.orderNo)).toEqual(["A1", "B1"]);
  });
});
