import { describe, expect, it } from "vitest";
import { CREATOR_SIGNATURE_LINK } from "@/entities/session/model/home-path";
import { creatorActionHref } from "@/entities/action-item/model/creator-action-items";
import { readCreatorActionItems, readCreatorActionItemsOrNull } from "./read-creator-action-items";

// 크리에이터 처리할 일 읽기 — 승인 서명 연결 줄(signup INV-U20 「크리에이터 홈 할 일」·approval-signature INV-S16, action-center INV-J5·J6).
// 줄은 이 읽기 한 번의 결과에 들어가야 사이드바 숫자·홈 한 줄·처리할 일 목록이 같은 수를 말한다(J6).

type Reply = { data: unknown; error: { code: string } | null };
const ROW = {
  request_id: null, share_id: "s1", box_id: null, box_seq: null, box_count: null, box_label: null, nickname: "별빛",
  item_kind: null, tier: "medium", measured_tier: null, amount_krw: null, has_electronics_or_metal: null, bluetooth: null, rf: null,
  choice: null, sent_at: "2026-11-01T00:00:00.000Z", received_at: null, due_at: null,
  prior_gift_count: null, prior_passed_count: null, prior_returned_count: null, kind: "unconfirmed", board: "sent",
};
const TWO_ROWS = [{ ...ROW, order_no: "RG-1" }, { ...ROW, order_no: "RG-2", share_id: "s2" }];

function client(link: Reply, items: Reply = { data: TWO_ROWS, error: null }) {
  const calls: string[] = [];
  return {
    calls,
    rpc: async (fn: string) => {
      calls.push(fn);
      if (fn === "my_creator_action_items") return items;
      if (fn === "my_signature_link") return link;
      throw new Error(fn);
    },
  };
}
const orderNos = (items: Awaited<ReturnType<typeof readCreatorActionItems>>) => items.map((i) => ("orderNo" in i ? i.orderNo : i.kind));

describe("INV-U20·S16: 승인 서명 연결 줄", () => {
  it("INV-U20 (S20): 연결 전이면 [연결 줄, 원래 줄 둘 그대로] — 줄 수(숫자)에 들어가고 원래 줄의 순서는 바뀌지 않는다", async () => {
    const c = client({ data: [{ linked: false, linked_at: null }], error: null });
    expect(orderNos(await readCreatorActionItems(c as never))).toEqual(["signature_link", "RG-1", "RG-2"]);
    expect(c.calls.sort()).toEqual(["my_creator_action_items", "my_signature_link"]);
  });

  it("INV-S16: 연결 뒤에는 원래 줄 둘 그대로 — 연결 줄이 없다", async () => {
    const c = client({ data: [{ linked: true, linked_at: "2026-11-10T01:00:00Z" }], error: null });
    expect(orderNos(await readCreatorActionItems(c as never))).toEqual(["RG-1", "RG-2"]);
  });

  it("INV-J6 (실패경로): 연결 여부를 못 읽으면 줄을 지어내지 않는다 — 목록 전체가 실패(숫자·한 줄이 함께 빠진다)", async () => {
    const c = client({ data: null, error: { code: "PGRST202" } });
    await expect(readCreatorActionItems(c as never)).rejects.toThrow();
    expect(await readCreatorActionItemsOrNull(c as never)).toBeNull();
    const odd = client({ data: [{ linked: "no" }], error: null });
    await expect(readCreatorActionItems(odd as never)).rejects.toThrow();
  });

  it("INV-U20: 연결 줄을 누르면 승인 서명 연결 화면(설정의 「승인 서명」 줄이 여는 곳)으로 간다", () => {
    expect(creatorActionHref({ kind: "signature_link" })).toBe(CREATOR_SIGNATURE_LINK);
    expect(CREATOR_SIGNATURE_LINK).toBe("/creator/settings/signature");
  });
});
