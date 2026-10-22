import { describe, expect, it } from "vitest";
import { creatorBlockNotice, receivingNotice, stopReason } from "./receiving-notice";

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

describe("stopReason · creatorBlockNotice — 지금 보낼 수 없는 크리에이터(1단계 회색 카드·「다음」·결제 직전이 같이 쓴다, d113 D-2)", () => {
  const moving = { moving: true, receiving: open };
  const resting = { receiving: { ...open, resumeOn: "2026-10-20" } };
  const limit = { receiving: open, limitReached: true };

  it("INV-V12·B2·B6: 이사 중 → 쉬는 중 → 이번 달 한도 순으로 하나만 — 겹치면 앞의 것", () => {
    expect(stopReason(moving, today)).toBe("moving");
    expect(stopReason(resting, today)).toBe("resting");
    expect(stopReason(limit, today)).toBe("limit");
    expect(stopReason({ ...resting, moving: true, limitReached: true }, today)).toBe("moving");
    expect(stopReason({ ...resting, limitReached: true }, today)).toBe("resting");
  });

  it("INV-B2 (실패경로): 보낼 수 있으면 null — 쉬는 날이 오늘 끝났거나 아무 제한이 없을 때", () => {
    expect(stopReason({ receiving: open }, today)).toBeNull();
    expect(stopReason({ receiving: { ...open, resumeOn: "2026-10-10" } }, today)).toBeNull();
    expect(stopReason(undefined, today)).toBeNull();
  });

  it("D-2: 회색 카드(stopReason)와 「다음」 안내(creatorBlockNotice)는 같은 판정이다 — 한쪽만 막는 경우가 없다", () => {
    for (const c of [moving, resting, limit, { receiving: open }, { ...resting, limitReached: true }, undefined]) {
      expect(stopReason(c, today) === null).toBe(creatorBlockNotice(c, today) === null);
    }
    expect(creatorBlockNotice(moving, today)).toContain("채널을 옮기는 중");
  });
});
