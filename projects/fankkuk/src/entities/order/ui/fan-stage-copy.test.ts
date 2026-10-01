import { describe, expect, it } from "vitest";
import type { FanGiftView, FanStep, FanStepKey } from "../model/fan-view";
import { fanGiftBucket, headerGiftState } from "./fan-stage-copy";

const KEYS: FanStepKey[] = ["registered", "approved", "received", "inspected", "shipped", "in_transit", "delivered"];

// doneCount 개 단계가 끝났고 그다음이 지금 단계인 진행 중 선물
function view(doneCount: number, outcome: FanGiftView["outcome"] = "in_progress"): FanGiftView {
  const steps: FanStep[] = KEYS.map((key, i) => ({
    key,
    at: null,
    state: i < doneCount ? "done" : i === doneCount && outcome === "in_progress" ? "current" : "todo",
  }));
  return {
    orderNo: "FC-TEST1",
    creatorName: "하루",
    itemKind: "편지",
    boxCount: 1,
    registeredAt: "2026-10-01T00:00:00.000Z",
    outcome,
    steps,
    officeAddress: null,
    canEnterTrackingNo: false,
    fanTrackingNo: null,
    expectedArrivalDate: null,
  };
}

describe("headerGiftState", () => {
  it("승인을 기다리는 선물은 모래시계(wait)", () => {
    expect(headerGiftState(view(1))).toBe("wait");
  });
  it("승인 뒤 수령 전까지는 트럭(move)", () => {
    for (let n = 2; n < KEYS.length; n++) expect(headerGiftState(view(n))).toBe("move");
  });
  it("모든 단계가 끝나면 체크(done)", () => {
    expect(headerGiftState(view(KEYS.length))).toBe("done");
  });
  it("받지 않음·반송·취소는 헤더에 띄우지 않는다", () => {
    expect(headerGiftState(view(1, "not_accepted"))).toBeNull();
    expect(headerGiftState(view(3, "returned"))).toBeNull();
    expect(headerGiftState(view(1, "canceled"))).toBeNull();
  });
});

describe("fanGiftBucket", () => {
  it("수령 전 진행 중 선물은 ongoing — 승인 대기도 포함", () => {
    expect(fanGiftBucket(view(1))).toBe("ongoing");
    expect(fanGiftBucket(view(KEYS.length - 1))).toBe("ongoing");
  });
  it("모든 단계가 끝난 선물은 ended — 헤더 아이콘(done)과 달리 진행 중으로 세지 않는다", () => {
    expect(fanGiftBucket(view(KEYS.length))).toBe("ended");
    expect(headerGiftState(view(KEYS.length))).toBe("done");
  });
  it("반송·취소는 ended, 거절·자동 반려는 not_accepted", () => {
    expect(fanGiftBucket(view(3, "returned"))).toBe("ended");
    expect(fanGiftBucket(view(1, "canceled"))).toBe("ended");
    expect(fanGiftBucket(view(1, "not_accepted"))).toBe("not_accepted");
  });
});
