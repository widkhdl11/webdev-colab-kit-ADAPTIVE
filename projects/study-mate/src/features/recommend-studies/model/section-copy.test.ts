import { describe, expect, it } from "vitest";
import { sectionCopy } from "./section-copy";

// 스펙: docs/specs/ai-assist.md — INV-G6
//
// 「그 구역의 화면 문구에 「추천」이라는 말이 들어가지 않는다」를 붙드는 자리.
// 문구를 순수 함수로 빼 두면 화면을 그리지 않고도 판정할 수 있다.

describe("INV-G6: 근거 없이 만든 순서를 「추천」이라 부르지 않는다", () => {
  it("INV-G6 (실패경로): 규칙으로 채운 구역의 문구에 「추천」이 없다", () => {
    const copy = sectionCopy("rule");
    expect(copy.title + copy.sub).not.toContain("추천");
  });

  it("INV-G6 (반대 절반): 모델이 고른 구역의 문구에는 「추천」이 있다", () => {
    // 이게 없으면 문구 함수가 늘 같은 값을 돌려줘도 위 검사 하나는 통과한다.
    const copy = sectionCopy("model");
    expect(copy.title + copy.sub).toContain("추천");
  });

  it("INV-G6: 두 문구가 서로 다르다", () => {
    expect(sectionCopy("rule")).not.toEqual(sectionCopy("model"));
  });

  it("INV-G6: 제목은 둘이 같다 — 나중에 채워지는 구역이라 제목이 갈아 끼워지면 눈에 띈다", () => {
    expect(sectionCopy("rule").title).toBe(sectionCopy("model").title);
  });

  it("INV-G6: 제목 자체는 무엇으로 골랐는지 주장하지 않는다", () => {
    // 제목이 「나에게 맞는」이면, 채워지기 전 자리 표시에도 그 주장이 먼저 뜬다.
    const title = sectionCopy("model").title;
    expect(title).not.toContain("추천");
    expect(title).not.toContain("인기");
  });

  it("INV-G6: 규칙 문구가 무엇을 보고 고른 순서인지 말한다", () => {
    // 「인기」라고만 하면 무엇으로 잰 인기인지 알 수 없다. 정직한 데모의 일부다.
    expect(sectionCopy("rule").sub).toContain("좋아요");
  });
});
