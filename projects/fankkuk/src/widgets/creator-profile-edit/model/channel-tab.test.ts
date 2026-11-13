import { describe, expect, it } from "vitest";
import type { MyVerificationState } from "@/entities/creator/model/creator-verification";
import { showsLinkSection } from "./channel-tab";

// 채널 탭 링크 입력 칸이 둘 생기지 않게(2026-11-13 ux 리뷰) — 확인 판이 ① 팬꾹 링크 만들기를 그리는 동안 선물 링크 판은 빠진다.

const base: MyVerificationState = {
  creatorId: "c1",
  name: "하루",
  channelTitle: "하루의 놀이터",
  verified: false,
  platform: null,
  channelUrl: null,
  verifiedAt: null,
  operatorOnly: false,
  handle: null,
  nextRecheckAt: null,
  graceUntil: null,
  recheckRequestedAt: null,
};

describe("채널 탭 — 선물 링크 판을 그리는가", () => {
  it("확인 전이고 링크도 없으면(확인 판이 링크 만들기 칸을 그린다) 그리지 않는다", () => {
    expect(showsLinkSection(base, [])).toBe(false);
  });

  it("링크가 있으면 그린다 — 확인 전이든 확인됐든", () => {
    expect(showsLinkSection({ ...base, handle: "haru" }, [])).toBe(true);
    expect(showsLinkSection({ ...base, handle: "haru", verified: true }, [])).toBe(true);
  });

  it("채널이 없으면(확인 판은 「채널 만들기」 링크만) 그린다", () => {
    expect(showsLinkSection({ ...base, name: null }, [])).toBe(true);
  });
});
