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
  it("거절·기간 지난 반려는 둘 다 「받지 않은 선물이에요」 — 거절 이유(차단 등)를 가르지 않는다", () => {
    expect(giftProgressOf({ ...base, outcome: "declined" }, 0)).toEqual({ kind: "note", text: "받지 않은 선물이에요" });
    expect(giftProgressOf({ ...base, outcome: "expired" }, 0)).toEqual({ kind: "note", text: "받지 않은 선물이에요" });
  });

  it("검수 반송은 그 사실을 알린다", () => {
    expect(giftProgressOf({ ...base, outcome: "returned", stage: "received" }, 0)).toEqual({ kind: "note", text: "검수에서 보낼 수 없는 물품이 확인돼 돌려보냈어요" });
  });

  it("출고 전에는 지금 단계 — 등록·입고·검수(승인 대기 / 곧 출고)", () => {
    expect(giftProgressOf(base, 0)).toEqual({ kind: "moving", tone: "warn", label: "도착 대기", title: "사무실 도착을 기다리고 있어요", done: 1, total: 6 });
    expect(giftProgressOf({ ...base, stage: "received" }, 0)).toMatchObject({ label: "입고", title: "사무실에 도착했어요. 검수하고 있어요", done: 2 });
    expect(giftProgressOf({ ...base, stage: "inspected" }, 0)).toMatchObject({ tone: "warn", label: "승인 대기", done: 3 });
    expect(giftProgressOf({ ...base, stage: "inspected", approved: true }, 0)).toMatchObject({ tone: "info", title: "검수를 마쳤어요. 곧 출고해요" });
  });

  it("출고 뒤에는 상자별 칸이 맡는다", () => {
    for (const stage of ["shipped", "in_transit", "delivered"] as const) {
      expect(giftProgressOf({ ...base, stage, shippedOn: "2026-10-05" }, 1)).toEqual({ kind: "boxes" });
    }
  });

  it("상자 여럿 중 하나라도 출고됐으면 주문 출고 전이어도 상자별 칸 — 거절·반송 안내가 먼저다", () => {
    expect(giftProgressOf({ ...base, stage: "inspected", approved: true, boxCount: 2 }, 1)).toEqual({ kind: "boxes" });
    expect(giftProgressOf({ ...base, outcome: "declined" }, 1)).toEqual({ kind: "note", text: "받지 않은 선물이에요" });
  });
});
