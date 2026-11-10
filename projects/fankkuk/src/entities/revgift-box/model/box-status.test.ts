import { describe, expect, it } from "vitest";
import { BOX_STAGE_NAME, BOX_STATUS_NAME, isClosedEmpty, isClosedEmptyRow, isFull, isReincludeLocked } from "./box-status";

// 선물함 화면 판정 (revgift-box INV-GB1·GB5·GB7 · Q21) — 화면에 흩어져 있던 규칙을 한 곳에서 본다.

describe("받을 인원이 다 찼는가 (INV-GB5)", () => {
  it("신청 수가 받을 인원과 같거나 넘으면 다 찼다, 하나라도 비면 아니다", () => {
    expect(isFull(20, 20)).toBe(true);
    expect(isFull(21, 20)).toBe(true);
    expect(isFull(19, 20)).toBe(false);
    expect(isFull(0, 1)).toBe(false);
  });
});

describe("다시 넣기 잠금 — 다시 넣기는 정원 안에서만 (INV-GB5 · GB7)", () => {
  it("제외된 신청은 다 찼을 때만 잠긴다", () => {
    expect(isReincludeLocked("excluded", true)).toBe(true);
    expect(isReincludeLocked("excluded", false)).toBe(false);
  });
  it("제외가 아닌 신청(신청·대기)은 다 차도 잠기지 않는다 — 빼는 쪽은 늘 된다", () => {
    expect(isReincludeLocked("applied", true)).toBe(false);
    expect(isReincludeLocked("waitlisted", true)).toBe(false);
  });
});

describe("0명 마감 (INV-GB1 · Q21)", () => {
  it("선물함: closed 이고 끝난 시각이 있으면 0명 마감, 끝난 시각이 없으면 상자 고르기 전 마감", () => {
    expect(isClosedEmpty({ status: "closed", endedAt: "2026-11-10T01:00:00Z" })).toBe(true);
    expect(isClosedEmpty({ status: "closed", endedAt: null })).toBe(false);
    expect(isClosedEmpty({ status: "done", endedAt: "2026-11-10T01:00:00Z" })).toBe(false);
  });
  it("목록 줄: closed 이면서 담길 팬 0명이면 0명 마감, 신청 받는 중 0명은 아니다", () => {
    expect(isClosedEmptyRow({ status: "closed", activeCount: 0 })).toBe(true);
    expect(isClosedEmptyRow({ status: "closed", activeCount: 2 })).toBe(false);
    expect(isClosedEmptyRow({ status: "open", activeCount: 0 })).toBe(false);
  });
});

describe("마감 뒤 진행 단계 이름 (design-rules 43절)", () => {
  it("상자 고르기 전은 「상자 크기 고르기」, 그 뒤는 상태 표기 그대로", () => {
    expect(BOX_STAGE_NAME.closed).toBe("상자 크기 고르기");
    expect(BOX_STATUS_NAME.closed).toBe("마감");
    expect(BOX_STAGE_NAME.awaiting_box).toBe("팬꾹으로 배송하기");
    expect(BOX_STAGE_NAME.invoiced).toBe("결제 요청");
    expect(BOX_STAGE_NAME.paid).toBe("발송 중");
  });
});
