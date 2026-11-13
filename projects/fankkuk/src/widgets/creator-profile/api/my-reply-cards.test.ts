import { describe, expect, it, vi } from "vitest";
import { readMyReplyCardsFor } from "./my-reply-cards";

// docs/specs/my-reply-cards.md — 상세 페이지 읽기: 읽을지 판단 + 팬 본인 답장 읽기(my_gift_replies)를 크리에이터로 걸러 부른다.

const HARU = "00000000-0000-4000-b000-000000000001";

function fakeClient(rows: unknown[] = []) {
  const rpc = vi.fn(async () => ({ data: rows, error: null }));
  return { client: { rpc } as never, rpc };
}

const shipped = (n: number, phrase: string | null, repliedOn: string | null) => ({
  box_id: `00000000-0000-4000-c000-${String(n).padStart(12, "0")}`,
  order_no: `FC-ORD${n}`,
  creator_id: HARU,
  box_seq: 1,
  box_count: 1,
  received: true,
  received_on: "2026-11-01",
  creator_name: "하루",
  creator_photo_path: null,
  phrase,
  line: null,
  replied_on: repliedOn,
  fan_public: false,
  fan_show_nickname: false,
  x_tag: null,
});

describe("INV-RC2: 읽기 함수는 팔로우한 팬일 때만 부른다", () => {
  it("INV-RC2 (실패경로): 로그인 전 · 팔로우 전 팬 · 크리에이터 · 운영자 — 호출 0번, 빈 목록", async () => {
    for (const [viewer, following] of [
      [null, false],
      [{ userId: "u", role: "fan" }, false],
      [{ userId: "u", role: "creator" }, true],
      [{ userId: "u", role: "operator" }, true],
    ] as const) {
      const { client, rpc } = fakeClient([shipped(1, "thanks", "2026-11-02")]);
      expect(await readMyReplyCardsFor(client, viewer, HARU, following)).toEqual([]);
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it("INV-RC1·INV-RC2: 팔로우한 팬 — 팬 본인 답장 읽기(my_gift_replies)를 이 크리에이터로 걸러 한 번 부른다(새 공개 읽기 아님)", async () => {
    const { client, rpc } = fakeClient([shipped(1, "thanks", "2026-11-02"), shipped(2, null, null)]);
    const cards = await readMyReplyCardsFor(client, { userId: "u", role: "fan" }, HARU, true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("my_gift_replies", { p_order_no: null, p_creator_id: HARU });
    expect(cards.map((c) => c.phrase)).toEqual(["thanks"]);
  });

  it("INV-RC2 (실패경로): 읽기가 실패해도 페이지는 연다 — 빈 목록", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { code: "XX000" } }));
    expect(await readMyReplyCardsFor({ rpc } as never, { userId: "u", role: "fan" }, HARU, true)).toEqual([]);
  });
});
