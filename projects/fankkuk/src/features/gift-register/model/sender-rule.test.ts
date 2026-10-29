import { describe, expect, it } from "vitest";
import { checkoutRequesterId, movingNotice, refusalStatus, sendAvailabilityOf, sendList, sendOnLinkPage } from "./sender-rule";

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
    expect(movingNotice({ moving: true })).toContain("채널 변경 확인 중");
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

describe("INV-B2: 선물 링크 페이지의 선물 보내기 자리 — 쉬는 중이면 숨김", () => {
  it("INV-B2 (실패경로): 쉬는 중이면 보낼 수 있던 자리(open·needs_follow)를 숨긴다", () => {
    expect(sendOnLinkPage("open", true)).toBe("hidden");
    expect(sendOnLinkPage("needs_follow", true)).toBe("hidden");
  });

  it("INV-B2: 받는 중이면 그대로, 자기 페이지는 쉬는 중이어도 그대로", () => {
    expect(sendOnLinkPage("open", false)).toBe("open");
    expect(sendOnLinkPage("needs_follow", false)).toBe("needs_follow");
    expect(sendOnLinkPage("self", true)).toBe("self");
  });
});

describe("INV-E15: 승인 서명 연결 전이면 선물 보내기 대신 「승인 수단 등록 전」", () => {
  it("INV-E15 S15 (실패경로): 연결 전이면 보낼 수 있던 자리(open·needs_follow)가 unsigned 가 된다", () => {
    expect(sendOnLinkPage("open", false, false)).toBe("unsigned");
    expect(sendOnLinkPage("needs_follow", false, false)).toBe("unsigned");
  });

  it("INV-E15 S15: 연결하면 선물 보내기가 돌아온다 — 쉬는 중이 먼저 이기고, 본인 화면은 그대로", () => {
    expect(sendOnLinkPage("open", false, true)).toBe("open");
    expect(sendOnLinkPage("needs_follow", false, true)).toBe("needs_follow");
    expect(sendOnLinkPage("open", true, false)).toBe("hidden");
    expect(sendOnLinkPage("self", false, false)).toBe("self");
  });

  it("INV-S16 S16b: DB 가 연결 전으로 거부한 등록은 409 와 그 문구", () => {
    expect(refusalStatus("unsigned")).toBe(409);
  });
});
