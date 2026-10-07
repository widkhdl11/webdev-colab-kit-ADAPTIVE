import { describe, expect, it } from "vitest";
import { pickOrder } from "./pick-order";

const c = (id: string) => ({ id });

describe("pickOrder — 선물 보내기 1단계 목록 순서", () => {
  const list = [c("a"), c("b"), c("c"), c("d"), c("e")];

  it("최근에 선물한 사람이 먼저(마지막으로 보낸 순)", () => {
    expect(pickOrder(list, { pinnedId: null, recentRecipientIds: ["d", "b"], followIds: [] }).map((x) => x.id).slice(0, 2)).toEqual(["d", "b"]);
  });

  it("선물한 적 없는 사람은 최근에 팔로우한 순 — followIds 는 팔로우한 순서(오래된 것부터)로 온다", () => {
    expect(pickOrder(list, { pinnedId: null, recentRecipientIds: [], followIds: ["a", "c", "e"] }).map((x) => x.id)).toEqual(["e", "c", "a", "b", "d"]);
  });

  it("두 기준을 같이 — 보낸 사람 다음에 팔로우 순", () => {
    expect(pickOrder(list, { pinnedId: null, recentRecipientIds: ["a"], followIds: ["a", "b", "c", "d", "e"] }).map((x) => x.id)).toEqual(["a", "e", "d", "c", "b"]);
  });

  it("미리 고른 사람은 맨 위", () => {
    expect(pickOrder(list, { pinnedId: "c", recentRecipientIds: ["a"], followIds: ["e"] }).map((x) => x.id)).toEqual(["c", "a", "e", "b", "d"]);
  });

  it("아무 정보가 없으면 받은 순서를 지킨다", () => {
    expect(pickOrder(list, { pinnedId: null, recentRecipientIds: [], followIds: [] }).map((x) => x.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
