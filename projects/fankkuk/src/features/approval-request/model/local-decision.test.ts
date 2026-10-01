import { describe, expect, it } from "vitest";
import { applyDecision, type LocalDecision } from "./local-decision";

const req = (orderNo: string, fanNickname: string) => ({ orderNo, fanNickname });
const requests = [req("A1", "도토리"), req("A2", "도토리"), req("A3", "도토리"), req("B1", "라떼한잔"), req("A4", "도토리")];

describe("applyDecision — 승인 요청 화면 안의 결정과 차단 전파", () => {
  it("결정한 줄에 그 결정을 적는다", () => {
    const next = applyDecision({}, requests, "A1", { kind: "signing" });
    expect(next.A1).toEqual({ kind: "signing" });
  });

  it("차단하며 거절하면 같은 팬의 대기 중·서명 대기 요청도 막힌다", () => {
    const before: Record<string, LocalDecision> = { A2: { kind: "signing" } };
    const next = applyDecision(before, requests, "A1", { kind: "declined", blocked: true });
    expect(next.A1).toEqual({ kind: "declined", blocked: true });
    expect(next.A2).toEqual({ kind: "blocked_elsewhere" }); // 서명 대기였다
    expect(next.A3).toEqual({ kind: "blocked_elsewhere" }); // 아직 아무 결정도 없었다(대기)
  });

  it("다른 팬의 요청은 그대로 둔다", () => {
    const next = applyDecision({ B1: { kind: "signing" } }, requests, "A1", { kind: "declined", blocked: true });
    expect(next.B1).toEqual({ kind: "signing" });
  });

  it("같은 팬이라도 이미 처리된 요청은 그대로 둔다", () => {
    const next = applyDecision({ A4: { kind: "declined", blocked: false } }, requests, "A1", { kind: "declined", blocked: true });
    expect(next.A4).toEqual({ kind: "declined", blocked: false });
  });

  it("차단 없이 거절하면 다른 요청은 바뀌지 않는다", () => {
    const next = applyDecision({}, requests, "A1", { kind: "declined", blocked: false });
    expect(Object.keys(next)).toEqual(["A1"]);
  });

  it("넘겨받은 기록을 고치지 않고 새 기록을 돌려준다", () => {
    const before: Record<string, LocalDecision> = {};
    applyDecision(before, requests, "A1", { kind: "declined", blocked: true });
    expect(before).toEqual({});
  });
});
