import { describe, expect, it } from "vitest";
import { creatorBlockNotice, receivingNotice, stopReason } from "./receiving-notice";

// 등록 화면에서 고른 크리에이터에게 보낼 수 없을 때의 안내 (creator-receiving INV-B2·B6). 등록은 DB 가 다시 막는다.

const today = { year: 2026, month: 10, day: 10 };
const open = { resumeOn: null, birthday: null, anniversaries: [] };

describe("receivingNotice — 고른 크리에이터의 받는 상태 안내", () => {
  it("INV-B2: 쉬는 중이면 「선물 받기 일시 중단 · {날짜}부터 재개」", () => {
    expect(receivingNotice({ receiving: { ...open, resumeOn: "2026-10-20" } }, today)).toBe("선물 받기 일시 중단 · 10월 20일부터 재개");
  });

  it("INV-B2 S2c: 다시 받는 날이 오늘이면 안내 없음", () => {
    expect(receivingNotice({ receiving: { ...open, resumeOn: "2026-10-10" } }, today)).toBeNull();
  });

  it("INV-B2: 받는 상태 정보가 없거나 고르지 않았으면 null — 팬당 한도는 2026-11-14 없앴다", () => {
    expect(receivingNotice({}, today)).toBeNull();
    expect(receivingNotice(undefined, today)).toBeNull();
  });
});

describe("stopReason · creatorBlockNotice — 지금 보낼 수 없는 크리에이터(1단계 회색 카드·「다음」·결제 직전이 같이 쓴다, d113 D-2)", () => {
  const moving = { moving: true, receiving: open };
  const resting = { receiving: { ...open, resumeOn: "2026-10-20" } };

  it("INV-V12·B2: 이사 중 → 쉬는 중 순으로 하나만 — 겹치면 앞의 것", () => {
    expect(stopReason(moving, today)).toBe("moving");
    expect(stopReason(resting, today)).toBe("resting");
    expect(stopReason({ ...resting, moving: true }, today)).toBe("moving");
  });

  it("INV-B2 (실패경로): 보낼 수 있으면 null — 쉬는 날이 오늘 끝났거나 아무 제한이 없을 때", () => {
    expect(stopReason({ receiving: open }, today)).toBeNull();
    expect(stopReason({ receiving: { ...open, resumeOn: "2026-10-10" } }, today)).toBeNull();
    expect(stopReason(undefined, today)).toBeNull();
  });

  it("D-2: 회색 카드(stopReason)와 「다음」 안내(creatorBlockNotice)는 같은 판정이다 — 한쪽만 막는 경우가 없다", () => {
    for (const c of [moving, resting, { receiving: open }, { ...resting, moving: true }, undefined]) {
      expect(stopReason(c, today) === null).toBe(creatorBlockNotice(c, today) === null);
    }
    expect(creatorBlockNotice(moving, today)).toContain("채널 변경 확인 중");
  });
});
