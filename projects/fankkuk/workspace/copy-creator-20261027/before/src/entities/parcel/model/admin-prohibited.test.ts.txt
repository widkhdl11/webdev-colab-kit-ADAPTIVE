import { describe, expect, it } from "vitest";
import { adminProhibitedItemsFromRows, describeProhibitedChange, prohibitedChangesFromRows, type ProhibitedChange } from "./admin-prohibited";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

describe("관리자 금지 물품 읽기 (INV-K9·K8)", () => {
  it("INV-K9: 목록 줄을 옮기고, 섞여 온 다른 칸은 버린다", () => {
    const rows = [{ id: ID, name: "칼", description: "", updated_at: "2026-10-03T01:05:00+00:00", changed_by: "uuid" }];
    expect(adminProhibitedItemsFromRows(rows)).toEqual([{ id: ID, name: "칼", description: "", updatedAt: "2026-10-03T01:05:00+00:00" }]);
  });

  it("INV-K9 (실패경로): 꼴이 다른 줄이 하나라도 있으면 null — 몰래 빼지 않는다", () => {
    expect(adminProhibitedItemsFromRows(null)).toBeNull();
    expect(adminProhibitedItemsFromRows([{ id: ID, name: 3, description: "", updated_at: "x" }])).toBeNull();
    expect(prohibitedChangesFromRows([{ at: "x", changed_by_nickname: "모아", action: "rename" }])).toBeNull();
  });

  it("INV-K9: 변경 기록 — 추가·지움은 이름 하나, 고침은 이름이 바뀌면 「전」→「후」, 설명만 바뀌면 「설명을 고침」", () => {
    const rows = [
      { at: "t", changed_by_nickname: "모아", action: "add", name_before: null, name_after: "칼", description_before: null, description_after: "" },
      { at: "t", changed_by_nickname: "모아", action: "edit", name_before: "칼", name_after: "날붙이", description_before: "", description_after: "" },
      { at: "t", changed_by_nickname: "라임", action: "edit", name_before: "칼", name_after: "칼", description_before: "", description_after: "새 설명" },
      { at: "t", changed_by_nickname: "라임", action: "delete", name_before: "칼", name_after: null, description_before: "", description_after: null },
    ];
    const changes = prohibitedChangesFromRows(rows) as ProhibitedChange[];
    expect(changes.map(describeProhibitedChange)).toEqual(["「칼」 추가", "「칼」→「날붙이」 고침", "「칼」 설명을 고침", "「칼」 지움"]);
    expect(changes[1]?.byNickname).toBe("모아");
  });

  it("INV-K9: 고침 기록의 나머지 두 갈래 — 고친 뒤 이름이 비어 오면 전 이름으로, 이름·설명이 그대로면 「X」 고침", () => {
    const base = { at: "t", byNickname: "모아", action: "edit" as const, descriptionBefore: "", descriptionAfter: "" };
    expect(describeProhibitedChange({ ...base, nameBefore: "칼", nameAfter: null })).toBe("「칼」 고침");
    expect(describeProhibitedChange({ ...base, nameBefore: "칼", nameAfter: null, descriptionAfter: "새 설명" })).toBe("「칼」 설명을 고침");
    expect(describeProhibitedChange({ ...base, nameBefore: "칼", nameAfter: "칼" })).toBe("「칼」 고침");
  });
});
