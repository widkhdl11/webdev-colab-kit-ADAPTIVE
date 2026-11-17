import { describe, expect, it } from "vitest";
import { readCreatorCards, readMyPublicPageHref } from "./creator-reads";

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

  it("INV-E13 S12: 공개 읽기의 테마 색(8색)을 카드에 싣는다 — 팬컬러는 읽어도 싣지 않는다", async () => {
    const [card] = await readCreatorCards(clientWith({ ...ROW, personal_color: "#DCEBFF", fan_color: "#FFF59D" }), { signedIn: false, onlyId: ROW.id });
    expect(card?.colors).toEqual({ personal: "#DCEBFF" });
  });

  it("INV-E13 S12: 8색 밖의 진한 색(#2B4C9B)도 그대로 싣는다", async () => {
    const [card] = await readCreatorCards(clientWith({ ...ROW, personal_color: "#2B4C9B", fan_color: null }), { signedIn: false, onlyId: ROW.id });
    expect(card?.colors).toEqual({ personal: "#2B4C9B" });
  });

  it("INV-E13 (실패경로): 꼴이 틀린 값(이름 색·스타일 문장·소문자)은 없는 것(기본 모양)으로 — 칸이 없거나 null 이어도 기본", async () => {
    for (const bad of ["red", "#DCEBFF; background:url(x)", "#dcebff"]) {
      const [card] = await readCreatorCards(clientWith({ ...ROW, personal_color: bad, fan_color: "#FFF59D" }), { signedIn: false, onlyId: ROW.id });
      expect(card?.colors, bad).toEqual({ personal: null });
    }
    const [none] = await readCreatorCards(clientWith({ ...ROW, personal_color: null, fan_color: null }), { signedIn: false, onlyId: ROW.id });
    expect(none?.colors).toEqual({ personal: null });
  });
});

// 크리에이터 「내 페이지」 메뉴 칸(DECISIONS 2026-11-17 카드 d6 「메뉴에 한 칸」) — 공개로 열리는 본인 페이지 주소, 없으면 null.
describe("내 페이지 주소 (creator-link INV-E5)", () => {
  const OWN = "00000000-0000-4000-b000-000000000001";
  function client(own: unknown, card: unknown, fail?: string) {
    const calls: string[] = [];
    return {
      calls,
      client: {
        rpc: async (fn: string) => {
          calls.push(fn);
          if (fn === fail) return { data: null, error: { code: "XX000" } };
          if (fn === "my_creator_id") return { data: own, error: null };
          if (fn === "creator_by_id") return { data: card, error: null };
          throw new Error(fn);
        },
      } as never,
    };
  }

  it("INV-E5: 링크 아이디가 있으면 /아이디, 없으면 /creators/<id> — 공개 읽기(creator_by_id)에 나온 값으로", async () => {
    expect(await readMyPublicPageHref(client([{ creator_id: OWN }], [{ ...ROW, handle: "haru" }]).client)).toBe("/haru");
    expect(await readMyPublicPageHref(client([{ creator_id: OWN }], [ROW]).client)).toBe(`/creators/${OWN}`);
  });

  it("INV-E5 (실패경로): 본인 확인 전(공개 읽기에 없음)·크리에이터 줄 없음·읽기 실패면 null — 메뉴 칸이 없다", async () => {
    expect(await readMyPublicPageHref(client([{ creator_id: OWN }], []).client)).toBeNull();
    const none = client([], [ROW]);
    expect(await readMyPublicPageHref(none.client)).toBeNull();
    expect(none.calls).toEqual(["my_creator_id"]);
    expect(await readMyPublicPageHref(client([{ creator_id: OWN }], [ROW], "creator_by_id").client)).toBeNull();
    expect(await readMyPublicPageHref(client(null, [ROW], "my_creator_id").client)).toBeNull();
  });
});
