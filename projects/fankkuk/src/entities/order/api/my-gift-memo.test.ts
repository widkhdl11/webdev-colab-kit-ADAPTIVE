import { describe, expect, it } from "vitest";
import { parseGiftMemo, readMyGiftMemo } from "./my-gift-memo";

// my_gift_memo 응답 → 선물 상세의 「나만 보는 메모」(together INV-F7·F8). 응답은 신뢰 경계 밖이라 형식을 검사한다.

describe("together INV-F8: 선물 상세의 나만 보는 메모 읽기", () => {
  it("INV-F7 S7: 이름·내용을 그대로 받는다(한쪽만 있어도)", () => {
    expect(parseGiftMemo({ title: "생일 편지와 인형", body: "첫 줄\n둘째 줄" })).toEqual({ title: "생일 편지와 인형", body: "첫 줄\n둘째 줄" });
    expect(parseGiftMemo({ title: null, body: "내용만" })).toEqual({ title: null, body: "내용만" });
  });

  it("INV-F8 (실패경로): 남의 주문·메모 없는 주문이면 함수가 null 을 준다 — 메모 칸을 그리지 않는다", () => {
    expect(parseGiftMemo(null)).toBeNull();
  });

  it("INV-F8 (실패경로): 꼴이 다르면 받지 않는다", () => {
    expect(() => parseGiftMemo({ title: 1, body: null })).toThrow();
    expect(() => parseGiftMemo("메모")).toThrow();
  });

  it("INV-F8: 로그인한 사람의 토큰으로 my_gift_memo 를 주문번호 하나로 부른다 — 계정 ID 인자는 없다", async () => {
    const calls: unknown[] = [];
    const client = { rpc: async (fn: string, args: unknown) => (calls.push([fn, args]), { data: { title: "t", body: null }, error: null }) };
    expect(await readMyGiftMemo(client as never, "FC-ABCDE")).toEqual({ title: "t", body: null });
    expect(calls).toEqual([["my_gift_memo", { p_order_no: "FC-ABCDE" }]]);
  });
});
