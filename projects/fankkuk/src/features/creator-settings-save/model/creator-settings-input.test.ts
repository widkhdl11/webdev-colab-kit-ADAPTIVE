import { describe, expect, it } from "vitest";
import { charCount } from "@/shared/lib/validation/char-count";
import { clipChars, oneLine } from "./creator-settings-input";

describe("글자 수 세기·입력 막기 (my-account INV-A9 화면)", () => {
  it("이모지 하나를 한 글자로 센다(DB char_length 와 같다)", () => {
    expect(charCount("하루🎁")).toBe(3);
    expect("하루🎁".length).toBe(4); // maxLength 가 쓰는 UTF-16 단위와 다르다
  });

  it("넘지 않으면 그대로 — 입력 중인 앞뒤 공백도 남긴다", () => {
    expect(clipChars(" 하루 ", 2)).toBe(" 하루 ");
    expect(clipChars("가".repeat(19) + "🎁", 20)).toBe("가".repeat(19) + "🎁");
  });

  it("넘으면 앞 공백을 빼고 코드 포인트로 max 자까지만 남긴다 — 이모지를 반으로 자르지 않는다", () => {
    expect(clipChars("가".repeat(20) + "🎁", 20)).toBe("가".repeat(20));
    expect(clipChars("🎁".repeat(21), 20)).toBe("🎁".repeat(20));
    expect(charCount(clipChars("  " + "나".repeat(25), 20))).toBe(20);
  });
});

describe("한 줄 칸 (creator-link INV-E6)", () => {
  it("INV-E6: 붙여 넣은 줄바꿈(CR·LF·줄 구분자·문단 구분자)은 띄어쓰기 하나로 바뀐다", () => {
    expect(oneLine("첫 줄\r\n둘째 줄\n\n셋째\u2028넷째\u2029끝")).toBe("첫 줄 둘째 줄 셋째 넷째 끝");
  });

  it("INV-E6: 줄바꿈이 없으면 그대로 — 탭·공백은 건드리지 않는다", () => {
    expect(oneLine(" 느긋한\t방송 ")).toBe(" 느긋한\t방송 ");
  });
});
