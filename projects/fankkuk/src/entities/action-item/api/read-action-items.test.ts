import { describe, expect, it } from "vitest";
import { CREATOR_SIGNATURE_LINK_PATH } from "@/shared/config/creator-paths";
import { readCreatorActionItems, readCreatorActionItemsOrNull } from "./read-action-items";
import { creatorActionHref } from "../model/creator-action-items";

// 크리에이터 처리할 일 읽기 — 승인 서명 연결 줄(signup INV-U20 「크리에이터 홈 할 일」·approval-signature INV-S16, action-center INV-J5·J6).
// 줄은 이 읽기 한 번의 결과에 들어가야 사이드바 숫자·홈 한 줄·처리할 일 목록이 같은 수를 말한다(J6).

type Reply = { data: unknown; error: { code: string } | null };
function client(link: Reply, items: Reply = { data: [], error: null }) {
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

describe("INV-U20·S16: 승인 서명 연결 줄", () => {
  it("INV-U20 (S20): 승인 서명이 연결되지 않은 크리에이터면 맨 앞에 연결 줄 하나 — 숫자(줄 수)에 들어간다", async () => {
    const c = client({ data: [{ linked: false, linked_at: null }], error: null });
    const items = await readCreatorActionItems(c as never);
    expect(items).toEqual([{ kind: "signature_link" }]);
    expect(c.calls.sort()).toEqual(["my_creator_action_items", "my_signature_link"]);
  });

  it("INV-S16: 연결된 크리에이터면 연결 줄이 없다", async () => {
    const c = client({ data: [{ linked: true, linked_at: "2026-11-10T01:00:00Z" }], error: null });
    expect(await readCreatorActionItems(c as never)).toEqual([]);
  });

  it("INV-J6 (실패경로): 연결 여부를 못 읽으면 줄을 지어내지 않는다 — 목록 전체가 실패(숫자·한 줄이 함께 빠진다)", async () => {
    const c = client({ data: null, error: { code: "PGRST202" } });
    await expect(readCreatorActionItems(c as never)).rejects.toThrow();
    expect(await readCreatorActionItemsOrNull(c as never)).toBeNull();
    const odd = client({ data: [{ linked: "no" }], error: null });
    await expect(readCreatorActionItems(odd as never)).rejects.toThrow();
  });

  it("INV-U20: 연결 줄을 누르면 승인 서명 연결 화면(설정의 「승인 서명」 줄이 여는 곳)으로 간다", () => {
    expect(creatorActionHref({ kind: "signature_link" })).toBe(CREATOR_SIGNATURE_LINK_PATH);
    expect(CREATOR_SIGNATURE_LINK_PATH).toBe("/creator/settings/signature");
  });
});
