import { describe, expect, it } from "vitest";
import type { CreatorCard } from "./creator-card";
import { newestFirst } from "./newest-creators";

const card = (id: string): CreatorCard => ({
  id,
  name: id,
  platform: "치지직",
  tags: ["치지직"],
  channelTitle: "",
  intro: "",
  alias: "",
  approvalMinutes: null,
  faceTone: "",
  following: false,
  handle: null,
  photoPath: null,
});

describe("newestFirst", () => {
  it("최근에 들어온 크리에이터가 앞에 온다", () => {
    expect(newestFirst([card("a"), card("b"), card("c")], 4).map((c) => c.id)).toEqual(["c", "b", "a"]);
  });

  it("앞 limit 명만 — 가장 오래된 사람이 빠진다", () => {
    expect(newestFirst([card("a"), card("b"), card("c"), card("d"), card("e")], 4).map((c) => c.id)).toEqual(["e", "d", "c", "b"]);
  });

  it("받은 목록을 바꾸지 않는다", () => {
    const list = [card("a"), card("b")];
    newestFirst(list, 4);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
