import { describe, expect, it } from "vitest";
import { clipChars, countChars } from "./creator-settings-input";

describe("글자 수 세기·입력 막기 (my-account INV-A9 화면)", () => {
  it("이모지 하나를 한 글자로 센다(DB char_length 와 같다)", () => {
    expect(countChars("하루🎁")).toBe(3);
    expect("하루🎁".length).toBe(4); // maxLength 가 쓰는 UTF-16 단위와 다르다
  });

  it("넘지 않으면 그대로 — 입력 중인 앞뒤 공백도 남긴다", () => {
    expect(clipChars(" 하루 ", 2)).toBe(" 하루 ");
    expect(clipChars("가".repeat(19) + "🎁", 20)).toBe("가".repeat(19) + "🎁");
  });

  it("넘으면 앞 공백을 빼고 코드 포인트로 max 자까지만 남긴다 — 이모지를 반으로 자르지 않는다", () => {
    expect(clipChars("가".repeat(20) + "🎁", 20)).toBe("가".repeat(20));
    expect(clipChars("🎁".repeat(21), 20)).toBe("🎁".repeat(20));
    expect(countChars(clipChars("  " + "나".repeat(25), 20))).toBe(20);
  });
});
