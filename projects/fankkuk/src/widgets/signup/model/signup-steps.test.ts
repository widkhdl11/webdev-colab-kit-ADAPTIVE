import { describe, expect, it } from "vitest";
import { phoneStepHead, stepDone } from "./signup-steps";

// 가입 3단계 머리와 단계 줄 완료 표시(UX 명세 signup.md 「2026-11-10 크리에이터 3단계 카카오톡 인증」 kakao_down·kakao_done).
describe("3단계 머리", () => {
  it("INV-U20 kakao_down (실패경로): 장애 대비 6자리 화면은 제목 「휴대폰 번호 확인」, 연결 설명 줄 없음 — 장애 안내와 어긋나지 않게", () => {
    expect(phoneStepHead("creator", true)).toEqual({ title: "휴대폰 번호 확인", lead: null, downNotice: true });
  });
  it("팬 3단계는 그대로 「휴대폰 번호 확인」, 장애 안내 없음", () => {
    expect(phoneStepHead("fan", false)).toEqual({ title: "휴대폰 번호 확인", lead: null, downNotice: false });
    expect(phoneStepHead("fan", true).downNotice).toBe(false);
  });
});

describe("단계 줄 완료 표시", () => {
  it("kakao_done: 계정이 생기면 지금 단계(3)도 체크 — 1~3 체크, 4 는 숫자", () => {
    const done = [1, 2, 3, 4].map((k) => stepDone({ k, step: 3, reached: 4, accountMade: true }));
    expect(done).toEqual([true, true, true, false]);
  });
  it("(실패경로) 계정이 생기기 전에는 지금 단계를 체크하지 않는다", () => {
    expect([1, 2, 3, 4].map((k) => stepDone({ k, step: 3, reached: 3, accountMade: false }))).toEqual([true, true, false, false]);
  });
});
