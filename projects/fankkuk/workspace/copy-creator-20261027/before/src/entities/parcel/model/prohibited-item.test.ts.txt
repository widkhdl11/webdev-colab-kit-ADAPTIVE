import { describe, expect, it } from "vitest";
import { prohibitedItemsFromRows } from "./prohibited-item";

describe("보낼 수 없는 물품 줄 읽기 (INV-K9)", () => {
  it("INV-K9: 정해진 세 칸만 옮긴다 — 다른 칸은 버린다", () => {
    const rows = [{ id: "a", name: "현금과 상품권", description: "", changed_by: "x" }];
    expect(prohibitedItemsFromRows(rows)).toEqual([{ id: "a", name: "현금과 상품권", description: "" }]);
  });

  it("INV-K9 (실패경로): 한 줄이라도 모양이 다르면 목록 전체가 실패다", () => {
    expect(prohibitedItemsFromRows([{ id: "a", name: "됨", description: "" }, { id: "b", name: "", description: "" }])).toBeNull();
    expect(prohibitedItemsFromRows([{ id: "a", name: "가".repeat(41), description: "" }])).toBeNull();
    expect(prohibitedItemsFromRows([{ id: "a", name: "됨", description: "나".repeat(121) }])).toBeNull();
    expect(prohibitedItemsFromRows(null)).toBeNull();
  });

  it("INV-K9: 경계값 — 이름 40자·설명 120자는 읽는다", () => {
    expect(prohibitedItemsFromRows([{ id: "a", name: "가".repeat(40), description: "나".repeat(120) }])).toHaveLength(1);
  });

  it("INV-K9: 글자 수는 DB 처럼 코드 포인트로 센다 — 이모지 40자 이름·120자 설명은 읽고, 41자·121자는 실패", () => {
    expect(prohibitedItemsFromRows([{ id: "a", name: "😀".repeat(40), description: "😀".repeat(120) }])).toHaveLength(1);
    expect(prohibitedItemsFromRows([{ id: "a", name: "😀".repeat(41), description: "" }])).toBeNull();
    expect(prohibitedItemsFromRows([{ id: "a", name: "됨", description: "😀".repeat(121) }])).toBeNull();
  });
});
