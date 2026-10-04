import { describe, expect, it } from "vitest";
import type { RevgiftShare } from "@/entities/parcel/model/office-lists";
import { countByShareTab, filterShares } from "./share-filter";

const base: RevgiftShare = {
  shareId: "s1",
  orderNo: "RG-1",
  creatorName: "하루",
  fanNickname: "모카",
  tier: "small",
  reply: "waiting",
  deadlineAt: "2026-10-10T00:00:00+00:00",
  receivedAt: null,
  refundStatus: null,
};
const rows: RevgiftShare[] = [base, { ...base, shareId: "s2", orderNo: "RG-2", reply: "declined", fanNickname: "별빛" }];

describe("역조공 몫 탭·검색 (office-workflow INV-W3)", () => {
  it("INV-W3: 팬의 답으로 거르고 건수를 센다", () => {
    expect(filterShares(rows, "declined", "").map((r) => r.shareId)).toEqual(["s2"]);
    expect(countByShareTab(rows)).toEqual({ all: 2, waiting: 1, accepted: 0, declined: 1, expired: 0 });
  });
  it("INV-W3: 주문번호·닉네임 검색", () => {
    expect(filterShares(rows, "all", "별빛").map((r) => r.shareId)).toEqual(["s2"]);
    expect(filterShares(rows, "all", "rg-1").map((r) => r.shareId)).toEqual(["s1"]);
  });
});
