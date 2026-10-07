import { describe, expect, it } from "vitest";
import { pickOrder } from "./pick-order";

const c = (id: string, following = false) => ({ id, following });

describe("pickOrder", () => {
  it("팔로우한 크리에이터가 앞으로 오고, 묶음 안에서는 받은 순서를 지킨다", () => {
    const list = [c("a"), c("b", true), c("c"), c("d", true)];
    expect(pickOrder(list, null).map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("미리 고른 사람은 팔로우하지 않았어도 맨 위에 온다", () => {
    const list = [c("a"), c("b", true), c("c")];
    expect(pickOrder(list, "c").map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("팔로우 정보가 없으면(손님) 순서를 바꾸지 않는다", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pickOrder(list, null).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
