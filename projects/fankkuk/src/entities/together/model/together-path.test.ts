import { describe, expect, it } from "vitest";
import { parseTogetherKey, togetherPath } from "./together-path";

// 함께한 시간 주소 `/gifts/with/{링크 주소 또는 ID}` (together 「스스로 정한 것」). 내용은 로그인한 사람의 주문에서만 만들어지므로
// 주소를 알아도 남의 기록은 나오지 않는다(INV-F1 — 판정은 DB 읽기 함수가 한다).

const ID = "00000000-0000-4000-c000-0000000000b3";

describe("togetherPath", () => {
  it("INV-F1: 링크 주소가 있으면 그것으로, 없으면 크리에이터 ID 로", () => {
    expect(togetherPath({ id: ID, handle: "haru" })).toBe("/gifts/with/haru");
    expect(togetherPath({ id: ID, handle: null })).toBe(`/gifts/with/${ID}`);
  });
});

describe("parseTogetherKey", () => {
  it("INV-F1: ID 꼴과 링크 주소 꼴을 가른다", () => {
    expect(parseTogetherKey(ID)).toEqual({ kind: "id", creatorId: ID });
    expect(parseTogetherKey("haru_01")).toEqual({ kind: "handle", handle: "haru_01" });
  });

  it("INV-F1 (실패경로): 어느 꼴도 아니면 없는 주소다", () => {
    expect(parseTogetherKey("Haru")).toEqual({ kind: "invalid" });
    expect(parseTogetherKey("a")).toEqual({ kind: "invalid" });
    expect(parseTogetherKey("haru%2F..")).toEqual({ kind: "invalid" });
  });
});
