import { describe, expect, it } from "vitest";
import { receivingNotice } from "./receiving-notice";

// 등록 화면에서 고른 크리에이터에게 보낼 수 없을 때의 안내 (creator-receiving INV-B2·B6). 등록은 DB 가 다시 막는다.

const today = { year: 2026, month: 10, day: 10 };
const open = { resumeOn: null, birthday: null, anniversaries: [] };

describe("receivingNotice — 고른 크리에이터의 받는 상태 안내", () => {
  it("INV-B2: 쉬는 중이면 「잠시 선물 받기를 쉬고 있어요. {날짜}부터 다시 받을게요」", () => {
    expect(receivingNotice({ receiving: { ...open, resumeOn: "2026-10-20" } }, today)).toBe("잠시 선물 받기를 쉬고 있어요. 10월 20일부터 다시 받을게요");
  });

  it("INV-B2 S2c: 다시 받는 날이 오늘이면 안내 없음", () => {
    expect(receivingNotice({ receiving: { ...open, resumeOn: "2026-10-10" } }, today)).toBeNull();
  });

  it("INV-B6 S6b: 한도에 닿았으면 문구 하나(다음 달 1일)", () => {
    expect(receivingNotice({ receiving: open, limitReached: true }, today)).toBe("이번 달은 이미 마음을 충분히 보내셨어요. 11월 1일부터 다시 보낼 수 있어요");
  });

  it("INV-B2·B6: 쉬는 중이면서 한도에도 닿았으면 쉬는 중을 먼저 — 받는 상태 정보가 없거나 고르지 않았으면 null", () => {
    expect(receivingNotice({ receiving: { ...open, resumeOn: "2026-10-20" }, limitReached: true }, today)).toMatch(/^잠시/);
    expect(receivingNotice({}, today)).toBeNull();
    expect(receivingNotice(undefined, today)).toBeNull();
  });
});
