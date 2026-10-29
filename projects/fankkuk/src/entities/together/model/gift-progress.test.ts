import { describe, expect, it } from "vitest";
import type { TogetherGift } from "../api/together-reads";
import { giftProgressOf } from "./gift-progress";

// 함께한 시간 선물 카드 아래 칸 — 받지 않은 선물·검수 반송·출고 전 진행 단계·출고 뒤(상자별 받았어요·답장 칸이 맡는다).

const base: TogetherGift = {
  orderNo: "FC-ABC123",
  giftNo: 1,
  registeredOn: "2026-10-02",
  itemKind: "인형",
  itemCategory: "doll",
  anniversaryName: null,
  boxCount: 1,
  outcome: "in_progress",
  stage: "registered",
  approved: false,
  shippedOn: null,
  photo: null,
};

describe("giftProgressOf", () => {
  it("거절·기간 지난 반려는 둘 다 「전달되지 않은 선물」 — 거절 이유(차단 등)를 가르지 않는다", () => {
    expect(giftProgressOf({ ...base, outcome: "declined" }, 0)).toEqual({ kind: "note", text: "전달되지 않은 선물" });
    expect(giftProgressOf({ ...base, outcome: "expired" }, 0)).toEqual({ kind: "note", text: "전달되지 않은 선물" });
  });

  it("검수 반송은 그 사실을 알린다", () => {
    expect(giftProgressOf({ ...base, outcome: "returned", stage: "received" }, 0)).toEqual({ kind: "note", text: "검수 불합격으로 반송 대상이 된 선물입니다" });
  });

  it("출고 전에는 지금 단계 — 등록·입고·검수(승인 대기 / 곧 출고)", () => {
    expect(giftProgressOf(base, 0)).toEqual({ kind: "moving", tone: "warn", label: "도착 대기", title: "팬꾹 도착을 기다리고 있습니다", done: 1, total: 6 });
    expect(giftProgressOf({ ...base, stage: "received" }, 0)).toMatchObject({ label: "입고 완료", title: "검수 중", done: 2 });
    expect(giftProgressOf({ ...base, stage: "inspected" }, 0)).toMatchObject({ tone: "warn", label: "승인 대기", done: 3 });
    expect(giftProgressOf({ ...base, stage: "inspected", approved: true }, 0)).toMatchObject({ tone: "info", title: "출고 대기" });
  });

  it("출고 뒤에는 상자별 칸이 맡는다", () => {
    for (const stage of ["shipped", "in_transit", "delivered"] as const) {
      expect(giftProgressOf({ ...base, stage, shippedOn: "2026-10-05" }, 1)).toEqual({ kind: "boxes" });
    }
  });

  it("상자 여럿 중 하나라도 출고됐으면 주문 출고 전이어도 상자별 칸 — 거절·반송 안내가 먼저다", () => {
    expect(giftProgressOf({ ...base, stage: "inspected", approved: true, boxCount: 2 }, 1)).toEqual({ kind: "boxes" });
    expect(giftProgressOf({ ...base, outcome: "declined" }, 1)).toEqual({ kind: "note", text: "전달되지 않은 선물" });
  });
});

describe("giftProgressOf — 출고 뒤 상자별 칸이 비었을 때", () => {
  it("출고 단계인데 상자별 줄이 0개면 빈 칸이 아니라 출고 문구 한 줄", () => {
    for (const stage of ["shipped", "in_transit", "delivered"] as const) {
      expect(giftProgressOf({ ...base, stage, shippedOn: "2026-10-05" }, 0), stage).toEqual({ kind: "note", text: "팬꾹 출고 완료" });
    }
  });
});
