import { describe, expect, it } from "vitest";
import type { RevgiftShare } from "@/entities/parcel/model/office-lists";
import { countByShareTab, filterShares, needsExpiryRun, SHARE_TABS } from "./share-filter";

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
  it("탭 이름은 용어집 7절 운영자 표기 — 수락 대기·수락·받지 않음(「기다리는 중」「받음」을 쓰지 않는다)", () => {
    expect(SHARE_TABS.map((t) => t.label)).toEqual(["전체", "수락 대기", "수락", "받지 않음", "기한 지남"]);
  });
  it("INV-W3: 주문번호·닉네임 검색", () => {
    expect(filterShares(rows, "all", "별빛").map((r) => r.shareId)).toEqual(["s2"]);
    expect(filterShares(rows, "all", "rg-1").map((r) => r.shareId)).toEqual(["s1"]);
  });
});

describe("기한 처리 버튼 (reverse-gift INV-R10)", () => {
  const deadlineAt = "2026-10-06T00:00:00.000Z";
  it("INV-R10: 기한이 지났고 답이 없는 몫에만 켠다", () => {
    expect(needsExpiryRun({ reply: "waiting", deadlineAt }, "2026-10-06T00:00:00.000Z")).toBe(true);
    expect(needsExpiryRun({ reply: "waiting", deadlineAt }, "2026-10-05T23:59:00.000Z")).toBe(false);
    for (const reply of ["accepted", "declined", "expired"] as const) {
      expect(needsExpiryRun({ reply, deadlineAt }, "2026-10-07T00:00:00.000Z")).toBe(false);
    }
  });
});
