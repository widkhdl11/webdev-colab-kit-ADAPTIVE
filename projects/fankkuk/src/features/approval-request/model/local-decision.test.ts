import { describe, expect, it } from "vitest";
import { applyDecision, type LocalDecision } from "./local-decision";

// 화면에 떠 있는 요청 다섯. 같은 닉네임이라도 같은 팬인지는 모른다 — 서버가 돌려준 「아직 대기 중」 목록으로만 가린다.
const requests = [{ orderNo: "A1" }, { orderNo: "A2" }, { orderNo: "A3" }, { orderNo: "B1" }, { orderNo: "A4" }];

describe("applyDecision — 승인 요청 화면 안의 결정과 차단 전파", () => {
  it("결정한 줄에 그 결정을 적는다", () => {
    const next = applyDecision({}, requests, "A1", { kind: "signing" });
    expect(next.A1).toEqual({ kind: "signing" });
  });

  it("INV-D8: 차단하며 거절하면 서버가 더는 대기 중이라 하지 않은 대기·서명 대기 줄이 막힌다", () => {
    const before: Record<string, LocalDecision> = { A2: { kind: "signing" } };
    const next = applyDecision(before, requests, "A1", { kind: "declined", blocked: true }, new Set(["B1"]));
    expect(next.A1).toEqual({ kind: "declined", blocked: true });
    expect(next.A2).toEqual({ kind: "blocked_elsewhere" }); // 서명 대기였다
    expect(next.A3).toEqual({ kind: "blocked_elsewhere" }); // 아직 아무 결정도 없었다(대기)
  });

  it("INV-D8 S8c: 서버가 아직 대기 중이라 한 줄(다른 팬)은 그대로 둔다", () => {
    const next = applyDecision({ B1: { kind: "signing" } }, requests, "A1", { kind: "declined", blocked: true }, new Set(["B1"]));
    expect(next.B1).toEqual({ kind: "signing" });
  });

  it("이미 처리된 줄은 그대로 둔다", () => {
    const next = applyDecision({ A4: { kind: "declined", blocked: false } }, requests, "A1", { kind: "declined", blocked: true }, new Set());
    expect(next.A4).toEqual({ kind: "declined", blocked: false });
  });

  it("차단 없이 거절하면 다른 줄은 바뀌지 않는다 — 대기 목록에서 빠진 줄이 있어도(7일 반려 등)", () => {
    const next = applyDecision({}, requests, "A1", { kind: "declined", blocked: false }, new Set());
    expect(Object.keys(next)).toEqual(["A1"]);
  });

  it("넘겨받은 기록을 고치지 않고 새 기록을 돌려준다", () => {
    const before: Record<string, LocalDecision> = {};
    applyDecision(before, requests, "A1", { kind: "declined", blocked: true }, new Set());
    expect(before).toEqual({});
  });
});
