import { describe, expect, it } from "vitest";
import { charCount } from "./char-count";

describe("charCount", () => {
  it("글자 수를 코드 포인트로 센다 — 이모지 하나는 한 글자", () => {
    expect(charCount("가나다")).toBe(3);
    expect(charCount("😀a")).toBe(2);
    expect(charCount("")).toBe(0);
  });
});
