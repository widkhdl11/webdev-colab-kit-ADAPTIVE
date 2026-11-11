import { describe, expect, it } from "vitest";
import { CREATOR_TO_CREATOR_GIFT_OPEN, giftSendOpenFor } from "./creator-gift-open";

// 크리에이터끼리 선물 닫기(2026-11-11 사용자) — 닫힌 동안 크리에이터에게만 「선물 보내기」가 없다
describe("giftSendOpenFor — 크리에이터끼리 선물을 닫아 둔 동안", () => {
  it("지금은 닫혀 있다", () => {
    expect(CREATOR_TO_CREATOR_GIFT_OPEN).toBe(false);
  });
  it("크리에이터에게는 닫힌다", () => {
    expect(giftSendOpenFor({ role: "creator" })).toBe(false);
  });
  it("팬·로그인 전·운영자에게는 그대로 열려 있다", () => {
    expect(giftSendOpenFor({ role: "fan" })).toBe(true);
    expect(giftSendOpenFor(null)).toBe(true);
    expect(giftSendOpenFor({ role: "operator" })).toBe(true);
  });
});
