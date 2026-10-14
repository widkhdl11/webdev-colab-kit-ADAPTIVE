import { describe, expect, it } from "vitest";
import { FAN_NAME_MAX, thanksLine } from "./fan-name";

// 팬을 부르는 이름 (추가분 4-1) — 링크 페이지 감사 문장

describe("thanksLine", () => {
  it("팬덤 이름이 있으면 「{팬덤 이름} 여러분의 마음 늘 감사해요」", () => {
    expect(thanksLine("꿀벌단")).toBe("꿀벌단 여러분의 마음 늘 감사해요");
    expect(thanksLine("  꿀벌단 ")).toBe("꿀벌단 여러분의 마음 늘 감사해요");
  });

  it("(실패경로) 없거나 공백뿐이면 기본 문장", () => {
    for (const v of [null, undefined, "", "   "]) expect(thanksLine(v)).toBe("보내주시는 마음 늘 감사해요");
  });

  it("최대 글자 수는 10자", () => {
    expect(FAN_NAME_MAX).toBe(10);
  });
});
