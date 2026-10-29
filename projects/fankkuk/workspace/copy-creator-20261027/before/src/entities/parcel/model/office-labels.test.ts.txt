import { describe, expect, it } from "vitest";
import { NEXT_STEP_TEXT, STATE_LABEL } from "./office-labels";

// 운영자 화면의 상태 이름·다음 단계 (office-workflow INV-W14·W15, 용어집 4절 운영자 열). 코드값이 화면에 그대로 나가지 않는다.

describe("사무실 상자 라벨 (office-workflow INV-W14·W15)", () => {
  it("INV-W14·W15: 상태 이름은 용어집 운영자 열 — 추적기 보관·신고 보관·경찰 인계·처분 대상·처분", () => {
    expect(STATE_LABEL.tracker_held.text).toBe("추적기 보관");
    expect(STATE_LABEL.report_held.text).toBe("신고 보관");
    expect(STATE_LABEL.police_handed.text).toBe("경찰 인계");
    expect(STATE_LABEL.dispose_due.text).toBe("처분 대상");
    expect(STATE_LABEL.disposed.text).toBe("처분");
  });

  it("INV-W14·W15: 모든 상태 이름과 다음 단계 문장에 코드값(영문 소문자·밑줄)이 없다", () => {
    for (const [code, { text }] of Object.entries(STATE_LABEL)) expect([code, /[a-z_]{3,}/.test(text)]).toEqual([code, false]);
    for (const [code, text] of Object.entries(NEXT_STEP_TEXT)) expect([code, /[a-z_]{3,}/.test(text)]).toEqual([code, false]);
  });

  it("INV-W15: 반송 주소를 기다리는 상자는 「반송 주소 확인 전」, 처분 대상은 처분 기록을 안내한다", () => {
    expect(NEXT_STEP_TEXT.wait_return_address).toContain("반송 주소 확인 전");
    expect(NEXT_STEP_TEXT.record_disposal).toContain("처분");
  });
});
