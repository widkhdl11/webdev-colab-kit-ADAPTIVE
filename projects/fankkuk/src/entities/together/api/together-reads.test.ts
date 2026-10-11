import { describe, expect, it } from "vitest";
import { parseTogetherGifts, parseTogetherSummaries } from "./together-reads";

// 함께한 시간 읽기의 꼴 검사 (together INV-F3·F6). 읽기 함수가 정한 칸만 받는다 — 금액·시각 칸이 섞여 오면 받지 않고(strict),
// 날짜 칸은 YYYY-MM-DD 만 받는다.

const summary = {
  creator_id: "c1",
  creator_name: "하루",
  creator_handle: "haru",
  creator_photo_path: null,
  gift_count: 4,
  reply_count: 2,
  first_gift_on: "2026-10-02",
  day_count: 11,
};

const gift = {
  order_no: "FC-ABC123",
  gift_no: 1,
  registered_on: "2026-10-02",
  item_kind: "인형",
  item_category: "doll",
  anniversary_name: null,
  box_count: 1,
  outcome: "in_progress",
  stage: "registered",
  approved: false,
  shipped_on: null,
  has_photo: false,
  photo_version: 0,
};

describe("parseTogetherSummaries", () => {
  it("INV-F3: 정해진 칸을 화면 모양으로 바꾼다", () => {
    expect(parseTogetherSummaries([summary])).toEqual([
      { creatorId: "c1", creatorName: "하루", creatorHandle: "haru", creatorPhotoPath: null, giftCount: 4, replyCount: 2, firstGiftOn: "2026-10-02", dayCount: 11 },
    ]);
  });

  it("INV-F6 (실패경로): 금액 칸이 섞여 오면 받지 않는다", () => {
    expect(() => parseTogetherSummaries([{ ...summary, total_krw: 13800 }])).toThrow();
  });

  it("INV-F6 (실패경로): 처음 선물한 날에 시각이 섞여 오면 받지 않는다", () => {
    expect(() => parseTogetherSummaries([{ ...summary, first_gift_on: "2026-10-01T15:30:00+00:00" }])).toThrow();
  });
});

describe("parseTogetherGifts", () => {
  it("INV-F6: 정해진 칸을 화면 모양으로 바꾼다", () => {
    expect(parseTogetherGifts([gift])).toEqual([
      {
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
      },
    ]);
    expect(parseTogetherGifts([{ ...gift, has_photo: true, photo_version: 3 }])[0]!.photo).toEqual({ version: 3 });
  });

  it("INV-F6 (실패경로): 금액 칸(상자 값)이 섞여 오면 받지 않는다", () => {
    expect(() => parseTogetherGifts([{ ...gift, price_krw: 6900 }])).toThrow();
  });

  it("INV-F6 (실패경로): 등록 날짜·출고 날짜에 시각이 섞여 오면 받지 않는다", () => {
    expect(() => parseTogetherGifts([{ ...gift, registered_on: "2026-10-02 00:30:00+09" }])).toThrow();
    expect(() => parseTogetherGifts([{ ...gift, shipped_on: "2026-10-03T09:00:00Z" }])).toThrow();
  });

  it("INV-F6 (실패경로): 시각 칸(registered_at)이 섞여 오면 받지 않는다", () => {
    expect(() => parseTogetherGifts([{ ...gift, registered_at: "2026-10-01T15:30:00Z" }])).toThrow();
  });
});
