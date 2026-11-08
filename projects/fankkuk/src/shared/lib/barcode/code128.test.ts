// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128Checksum, code128Widths } from "./code128";

describe("Code 128 B", () => {
  it("표 107개 — 기호마다 막대 셋·빈칸 셋, 합 11칸(끝 기호는 13칸), 서로 다르다", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = Array.from(p, Number).reduce((a, b) => a + b, 0);
      expect([i, sum]).toEqual([i, i === 106 ? 13 : 11]);
      // 검은 막대 칸의 합은 짝수(표준 표의 성질 — 표 오타를 잡는다)
      const bars = Array.from(p, Number).filter((_, k) => k % 2 === 0).reduce((a, b) => a + b, 0);
      expect([i, bars % 2]).toEqual([i, 0]);
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it("확인 기호 — (104 + Σ 값 × 자리) mod 103", () => {
    // 「GB1」: G=39, B=34, 1=17 → 104 + 39 + 68 + 51 = 262 → 56
    expect(code128Checksum([39, 34, 17])).toBe(56);
  });

  it("「GB00000012」 → 시작 B + 글자 10개 + 확인 + 끝 = 11칸 × 12 + 13칸, 처음은 시작 B 의 막대", () => {
    const w = code128Widths("GB00000012")!;
    expect(w.reduce((a, b) => a + b, 0)).toBe(11 * 12 + 13);
    expect(w.slice(0, 6).join("")).toBe("211214");
    expect(w.slice(-7).join("")).toBe("2331112");
  });

  it("B 집합 밖 글자(한글)·빈 글자는 그리지 않는다", () => {
    expect(code128Widths("별빛")).toBeNull();
    expect(code128Widths("")).toBeNull();
  });
});
