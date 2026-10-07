import { describe, expect, it } from "vitest";
import type { CreatorCard } from "./creator-card";
import { newestSearchable } from "./newest-creators";

const card = (id: string): CreatorCard => ({
  id,
  name: id,
  platform: "치지직",
  category: "게임",
  channelTitle: "",
  intro: "",
  alias: "",
  approvalMinutes: null,
  faceTone: "",
  following: false,
});

describe("newestSearchable", () => {
  it("최근에 들어온 크리에이터가 앞에 온다", () => {
    const all = [card("a"), card("b"), card("c")];
    expect(newestSearchable(all, all).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("찾기에 나오지 않는 크리에이터는 뺀다", () => {
    const all = [card("a"), card("b"), card("c")];
    expect(newestSearchable(all, [card("a"), card("c")]).map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("순서는 찾기 목록이 아니라 전체 목록(들어온 순서)을 따른다", () => {
    const all = [card("a"), card("b"), card("c")];
    expect(newestSearchable(all, [card("c"), card("a"), card("b")]).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });
});
