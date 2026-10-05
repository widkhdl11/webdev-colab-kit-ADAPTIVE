import { describe, expect, it } from "vitest";
import { checkoutRequesterId, creatorSendList, movingNotice, refusalStatus, sendAvailabilityOf } from "./sender-rule";

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
  it("팬·손님은 늘 열림 — 팔로우 조건이 없다", () => {
    expect(sendAvailabilityOf({ viewerRole: "fan", creatorId: MOMO, ownCreatorId: null, canSend: false })).toBe("open");
    expect(sendAvailabilityOf({ viewerRole: null, creatorId: MOMO, ownCreatorId: null, canSend: false })).toBe("open");
  });
  it("크리에이터: 자기 페이지 / 보낼 수 있음 / 팔로우 필요", () => {
    expect(sendAvailabilityOf({ viewerRole: "creator", creatorId: OWN, ownCreatorId: OWN, canSend: true })).toBe("self");
    expect(sendAvailabilityOf({ viewerRole: "creator", creatorId: MOMO, ownCreatorId: OWN, canSend: true })).toBe("open");
    expect(sendAvailabilityOf({ viewerRole: "creator", creatorId: MOMO, ownCreatorId: OWN, canSend: false })).toBe("needs_follow");
  });
});

describe("크리에이터의 선물 보내기 목록", () => {
  const cards = [
    { id: OWN, following: true },
    { id: MOMO, following: true },
    { id: SAEBYEOK, following: false },
  ];
  it("팔로우한 사람만, 자기 자신은 빼고", () => {
    expect(creatorSendList(cards, OWN, null).map((c) => c.id)).toEqual([MOMO]);
  });
  it("미리 고른 사람은 보낼 수 있을 때만 더한다 — 받는 쪽만 팔로우한 경우", () => {
    expect(creatorSendList(cards, OWN, { id: SAEBYEOK, canSend: true }).map((c) => c.id)).toEqual([MOMO, SAEBYEOK]);
    expect(creatorSendList(cards, OWN, { id: SAEBYEOK, canSend: false }).map((c) => c.id)).toEqual([MOMO]);
  });
  it("미리 고른 사람이 자기 자신이면 보낼 수 있다고 와도 뺀다", () => {
    expect(creatorSendList(cards, OWN, { id: OWN, canSend: true }).map((c) => c.id)).toEqual([MOMO]);
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
