import { describe, expect, it } from "vitest";
import { checkoutRequesterId, movingNotice, refusalStatus, sendAvailabilityOf, sendList } from "./sender-rule";

const OWN = "00000000-0000-4000-b000-000000000001";
const MOMO = "00000000-0000-4000-b000-000000000002";
const SAEBYEOK = "00000000-0000-4000-b000-000000000003";

describe("결제 확정을 요청한 사람 (INV-L3)", () => {
  it("팬·크리에이터는 자기 ID, 운영자·손님은 null", () => {
    expect(checkoutRequesterId({ userId: "f", role: "fan" })).toBe("f");
    expect(checkoutRequesterId({ userId: "c", role: "creator" })).toBe("c");
    expect(checkoutRequesterId({ userId: "o", role: "operator" })).toBeNull();
    expect(checkoutRequesterId(null)).toBeNull();
  });
});

describe("크리에이터 페이지의 선물 보내기 자리 (INV-L8·INV-L9 화면 표시)", () => {
  it("INV-L9: 팬·크리에이터 모두 — 팔로우했으면 열림, 아니면 팔로우 필요", () => {
    expect(sendAvailabilityOf({ viewerRole: "fan", creatorId: MOMO, ownCreatorId: null, following: true })).toBe("open");
    expect(sendAvailabilityOf({ viewerRole: "fan", creatorId: MOMO, ownCreatorId: null, following: false })).toBe("needs_follow");
    expect(sendAvailabilityOf({ viewerRole: "creator", creatorId: MOMO, ownCreatorId: OWN, following: true })).toBe("open");
    expect(sendAvailabilityOf({ viewerRole: "creator", creatorId: MOMO, ownCreatorId: OWN, following: false })).toBe("needs_follow");
  });
  it("손님은 팔로우할 수 없으니 팔로우 필요(누르면 로그인으로)", () => {
    expect(sendAvailabilityOf({ viewerRole: null, creatorId: MOMO, ownCreatorId: null, following: false })).toBe("needs_follow");
  });
  it("INV-L8: 크리에이터 자기 페이지는 팔로우와 상관없이 self", () => {
    expect(sendAvailabilityOf({ viewerRole: "creator", creatorId: OWN, ownCreatorId: OWN, following: true })).toBe("self");
  });
});

describe("선물 보내기 목록 (INV-L8·INV-L9)", () => {
  const cards = [
    { id: OWN, following: true },
    { id: MOMO, following: true },
    { id: SAEBYEOK, following: false },
  ];
  it("INV-L9: 팔로우한 사람만 — 팬은 자기 크리에이터 id 가 없다", () => {
    expect(sendList(cards, null).map((c) => c.id)).toEqual([OWN, MOMO]);
  });
  it("INV-L8: 크리에이터는 자기 자신을 뺀다", () => {
    expect(sendList(cards, OWN).map((c) => c.id)).toEqual([MOMO]);
  });
});

describe("채널 이사 중 안내 (creator-verification INV-V12 화면 표시)", () => {
  it("INV-V12: 고른 크리에이터가 이사 중이면 안내 문구, 아니면·안 골랐으면 null", () => {
    expect(movingNotice({ moving: true })).toContain("채널을 옮기는 중");
    expect(movingNotice({ moving: false })).toBeNull();
    expect(movingNotice({})).toBeNull();
    expect(movingNotice(undefined)).toBeNull();
  });

  it("INV-V12: 이사 중 거부는 409 — 없는 크리에이터(404)·보내는 사람 거부(403)와 다르다", () => {
    expect(refusalStatus("moving")).toBe(409);
    expect(refusalStatus("unknown_creator")).toBe(404);
    expect(refusalStatus("no_follow")).toBe(403);
  });
});
