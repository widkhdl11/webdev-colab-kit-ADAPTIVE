import { describe, expect, it } from "vitest";
import { BOX_ENTRY_LABEL, boxEntryHref, boxEntryOf } from "./box-entry";

// 크리에이터 상세 선물함 입구 — 타일 뱃지·상세 창 버튼 (revgift-box INV-GB4·GB5·GB9, handle.md 선물함 칸 상태 4개)

describe("선물함 입구 뱃지·버튼", () => {
  it("신청하지 않음·상태 모름 → 뱃지 없이 「신청」", () => {
    for (const myState of ["none", "cancelled", null] as const) {
      expect(boxEntryOf({ owner: false, myState, waitlistNo: null }), String(myState)).toEqual({ badge: null, action: "apply" });
    }
  });
  it("정원 안 신청 → 「신청함」 + 「신청 보기」", () => {
    expect(boxEntryOf({ owner: false, myState: "applied", waitlistNo: null })).toEqual({ badge: "신청함", action: "view" });
  });
  it("INV-GB9: 대기 → 내 순번만 「대기 N번」 + 「신청 보기」", () => {
    expect(boxEntryOf({ owner: false, myState: "waitlisted", waitlistNo: 2 })).toEqual({ badge: "대기 2번", action: "view" });
  });
  it("(실패경로) 대기인데 순번이 없으면 숫자를 지어내지 않는다", () => {
    expect(boxEntryOf({ owner: false, myState: "waitlisted", waitlistNo: null })).toEqual({ badge: null, action: "view" });
  });
  it("본인은 내 신청 상태와 관계없이 「신청 관리」", () => {
    expect(boxEntryOf({ owner: true, myState: "applied", waitlistNo: null })).toEqual({ badge: null, action: "manage" });
  });
  it("버튼 이름은 「신청」 — 「신청하기」가 아니다(문구 규칙 5)", () => {
    expect(BOX_ENTRY_LABEL).toEqual({ apply: "신청", view: "신청 보기", manage: "신청 관리" });
  });
  it("신청·신청 보기는 팬 선물함 화면, 신청 관리는 크리에이터 관리 화면", () => {
    expect(boxEntryHref("apply", "b1")).toBe("/gift-boxes/b1");
    expect(boxEntryHref("view", "b1")).toBe("/gift-boxes/b1");
    expect(boxEntryHref("manage", "b1")).toBe("/creator/revgift-boxes/b1");
  });
});
