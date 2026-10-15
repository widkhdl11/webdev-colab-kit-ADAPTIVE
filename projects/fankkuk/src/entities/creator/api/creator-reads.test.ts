import { describe, expect, it } from "vitest";
import { readCreatorCards } from "./creator-reads";

const ROW = {
  id: "00000000-0000-4000-b000-000000000001",
  name: "하루",
  channel: "치지직",
  channel_title: "하루의 놀이터",
  tags: ["치지직"],
  intro: "",
  alias: "haru",
  avg_approval_hours: 2,
  face_tone: "var(--face-6)",
  approval_minutes_from_orders: null,
  handle: null,
  photo_path: null,
};

function fakeClient() {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      return { data: fn === "my_follows" ? [] : [ROW], error: null };
    },
  } as never;
  return { calls, client };
}

describe("크리에이터 카드 읽기 — 어느 DB 읽기를 부르나 (my-account INV-A10)", () => {
  it("INV-A10: 찾기 목록은 find_creators, 그 밖의 목록은 list_creators", async () => {
    const search = fakeClient();
    await readCreatorCards(search.client, { signedIn: false, forSearch: true });
    expect(search.calls.map((c) => c.fn)).toEqual(["find_creators"]);
    const list = fakeClient();
    await readCreatorCards(list.client, { signedIn: false });
    expect(list.calls.map((c) => c.fn)).toEqual(["list_creators"]);
  });

  it("INV-A10 S10b: 한 명(onlyId)은 creator_by_id — 노출을 끈 크리에이터도 페이지 주소로 열린다", async () => {
    const one = fakeClient();
    const cards = await readCreatorCards(one.client, { signedIn: true, onlyId: ROW.id });
    expect(one.calls).toEqual([
      { fn: "creator_by_id", args: { p_id: ROW.id } },
      { fn: "my_follows", args: undefined },
    ]);
    expect(cards.map((c) => c.id)).toEqual([ROW.id]);
  });

  it("INV-A10 (실패경로): 주소의 id 가 ID 꼴이 아니면 DB 를 부르지 않고 빈 배열 — 페이지는 404 로 간다", async () => {
    const bad = fakeClient();
    expect(await readCreatorCards(bad.client, { signedIn: true, onlyId: "abc" })).toEqual([]);
    expect(bad.calls).toEqual([]);
  });
});

describe("크리에이터 색 읽기 (creator-link INV-E13·E7)", () => {
  function clientWith(row: Record<string, unknown>) {
    return { rpc: async (fn: string) => ({ data: fn === "my_follows" ? [] : [row], error: null }) } as never;
  }

  it("INV-E13: 공개 읽기의 두 색을 카드에 싣는다", async () => {
    const [card] = await readCreatorCards(clientWith({ ...ROW, personal_color: "#1E3A8A", fan_color: "#FFF59D" }), { signedIn: false, onlyId: ROW.id });
    expect(card?.colors).toEqual({ personal: "#1E3A8A", fan: "#FFF59D" });
  });

  it("INV-E13 (실패경로): 꼴이 틀린 색(스타일 문장·소문자)은 없는 것(기본 모양)으로 — 칸이 없거나 null 이어도 기본", async () => {
    const [bad] = await readCreatorCards(clientWith({ ...ROW, personal_color: "#123456; background:url(x)", fan_color: "#fff59d" }), { signedIn: false, onlyId: ROW.id });
    expect(bad?.colors).toEqual({ personal: null, fan: null });
    const [none] = await readCreatorCards(clientWith({ ...ROW, personal_color: null, fan_color: null }), { signedIn: false, onlyId: ROW.id });
    expect(none?.colors).toEqual({ personal: null, fan: null });
  });
});
