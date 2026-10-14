import { describe, expect, it } from "vitest";
import type { FanApproval, FanGiftView, FanStep, FanStepKey } from "../model/fan-view";
import { fanBadge, fanGiftBucket, fanHeadline, fanStepDetail, headerGiftState } from "./fan-stage-copy";

const KEYS: FanStepKey[] = ["registered", "received", "inspected", "shipped", "in_transit", "delivered"];

// doneCount 개 단계가 끝났고 그다음이 지금 단계인 진행 중 선물
function view(
  doneCount: number,
  outcome: FanGiftView["outcome"] = "in_progress",
  approval: FanApproval = { state: doneCount > 3 ? "done" : "todo", at: null },
): FanGiftView {
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
    approval,
    officeAddress: null,
    canEnterTrackingNo: false,
    fanTrackingNo: null,
    expectedArrivalDate: null,
    earlySendPending: false,
  };
}

describe("INV-S9: 「먼저 보내기」 전 표시", () => {
  it("INV-S9: 입고 전·승인 전이고 「먼저 보내기」를 아직 누르지 않았으면 「승인 대기 · 승인을 기다리는 중」 — 「보내 주세요」라고 하지 않는다", () => {
    const v = { ...view(1), earlySendPending: true };
    expect(fanBadge(v)).toEqual({ text: "승인 대기", tone: "warn" });
    expect(fanHeadline(v)).toBe("크리에이터의 승인을 기다리는 중이에요");
  });

  it("INV-S9 (실패경로): 누른 뒤에는 그대로 「보내 주세요」", () => {
    expect(fanBadge(view(1)).text).toBe("보내 주세요");
    expect(fanHeadline(view(1))).toBe("사무실로 보내 주세요");
  });
});

describe("headerGiftState", () => {
  it("검수를 마치고 승인을 기다리는 선물은 모래시계(wait)", () => {
    expect(headerGiftState(view(3, "in_progress", { state: "waiting", at: null }))).toBe("wait");
  });
  it("그 밖의 수령 전 선물은 트럭(move) — 승인 전이라도 보내는 중이면 트럭", () => {
    for (let n = 1; n < KEYS.length; n++) expect(headerGiftState(view(n))).toBe("move");
  });
  it("모든 단계가 끝나면 체크(done)", () => {
    expect(headerGiftState(view(KEYS.length))).toBe("done");
  });
  it("받지 않음·반송·취소는 헤더에 띄우지 않는다", () => {
    expect(headerGiftState(view(1, "declined"))).toBeNull();
    expect(headerGiftState(view(1, "expired"))).toBeNull();
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
    expect(fanGiftBucket(view(1, "declined"))).toBe("not_accepted");
    expect(fanGiftBucket(view(1, "expired"))).toBe("not_accepted");
  });
});

describe("승인 대기 문구", () => {
  it("검수 뒤 승인 대기면 한 줄 문구와 배지가 승인을 기다린다고 말한다", () => {
    const v = view(3, "in_progress", { state: "waiting", at: null });
    expect(fanHeadline(v)).toContain("승인을 기다려요");
    expect(fanBadge(v).text).toBe("승인 대기");
  });
  it("승인이 끝났으면 같은 출고 단계라도 곧 출고한다고 말한다", () => {
    const v = view(3, "in_progress", { state: "done", at: null });
    expect(fanHeadline(v)).not.toContain("승인을 기다려요");
    expect(fanBadge(v).text).not.toBe("승인 대기");
  });
});

describe("상태 배지 색 갈래", () => {
  it("끝남은 success, 기다림은 warn, 진행 단계는 info", () => {
    expect(fanBadge(view(6)).tone).toBe("success"); // 수령 완료
    expect(fanBadge(view(1)).tone).toBe("warn"); // 보내 주세요
    expect(fanBadge(view(3, "in_progress", { state: "waiting", at: null })).tone).toBe("warn"); // 승인 대기
    expect(fanBadge(view(2)).tone).toBe("info"); // 입고
  });
  it("받지 않음·반송은 danger, 취소는 무색", () => {
    expect(fanBadge(view(1, "declined")).tone).toBe("danger");
    expect(fanBadge(view(1, "expired")).tone).toBe("danger");
    expect(fanBadge(view(3, "returned")).tone).toBe("danger");
    expect(fanBadge(view(1, "canceled")).tone).toBe("plain");
  });
});

describe("decline-block INV-D5: 팬에게 보이는 거절과 기간 지남", () => {
  it("거절은 크리에이터 이름으로 부드럽게 말하되 거절했다는 뜻을 전한다", () => {
    expect(fanHeadline(view(1, "declined"))).toBe("하루님이 선물을 원하지 않아요");
    expect(fanBadge(view(1, "declined")).text).toBe("거절");
  });
  it("7일 자동 반려는 기간이 지났다고 따로 말한다", () => {
    expect(fanHeadline(view(1, "expired"))).toBe("기간이 지나 반려됐어요");
    expect(fanBadge(view(1, "expired")).text).toBe("기간 지남");
  });
});


describe("팬 단계 시각은 날짜까지만 (2026-10-14 추가분 3)", () => {
  const AT = "2026-10-05T05:37:00.000Z"; // 서울 10월 5일 오후 2:37
  it("끝난 단계·멈춘 단계·출고 단계 모두 날짜만 나오고 시:분은 없다", () => {
    const v = view(6);
    for (const key of ["received", "inspected", "in_transit", "delivered"] as const) {
      const detail = fanStepDetail({ key, at: AT, state: "done" }, v) ?? "";
      expect(detail).toContain("10월 5일");
      expect(detail).not.toMatch(/\d+:\d{2}|오전|오후/);
    }
    expect(fanStepDetail({ key: "inspected", at: AT, state: "stopped" }, v)).toBe("10월 5일 (월) · 반송");
  });
});
