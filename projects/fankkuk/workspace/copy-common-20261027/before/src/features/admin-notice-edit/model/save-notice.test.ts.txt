import { describe, expect, it } from "vitest";
import { saveNotice } from "./save-notice";

type Who = { operator: boolean; owner: boolean };

function fakeClient(reply: { data?: unknown; error: { code: string } | null }, who: Who = { operator: true, owner: false }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

describe("공지 쓰기·고치기 (INV-K11)", () => {
  it("INV-K11: 새 공지는 slug 없이(null) DB 에 넘기고, DB 가 준 slug 를 돌려준다", async () => {
    const { calls, client } = fakeClient({ data: "n-abc123", error: null });
    const reply = await saveNotice(client, { slug: null, title: "  점검 안내 ", body: "첫 문단\n\n둘째 문단", pinned: true });
    expect(reply).toEqual({ status: 200, body: { ok: true, slug: "n-abc123" } });
    expect(calls).toEqual([{ fn: "admin_save_notice", args: { p_slug: null, p_title: "점검 안내", p_body: "첫 문단\n\n둘째 문단", p_pinned: true } }]);
  });

  it("INV-K11: 있는 공지를 고칠 때는 그 slug 를 넘긴다", async () => {
    const { calls, client } = fakeClient({ data: "open-notice", error: null });
    expect((await saveNotice(client, { slug: "open-notice", title: "제목", body: "본문", pinned: false })).status).toBe(200);
    expect(calls[0]?.args).toMatchObject({ p_slug: "open-notice" });
  });

  it("INV-K11 (실패경로): 운영자가 아니면 404 — 공지 저장 함수를 부르지 않는다", async () => {
    const { calls, client } = fakeClient({ error: null }, { operator: false, owner: false });
    expect(await saveNotice(client, { slug: null, title: "제목", body: "본문", pinned: false })).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(calls).toEqual([]);
  });

  it("INV-K11 (실패경로): 제목 1~100자·본문 5000자 이하(빈 본문 거부)를 어기거나 꼴이 틀리면 DB 를 부르지 않고 400", async () => {
    const ok = { slug: null, title: "제목", body: "본문", pinned: false };
    const bad: unknown[] = [
      null,
      { ...ok, title: "" },
      { ...ok, title: "  " },
      { ...ok, title: "가".repeat(101) },
      { ...ok, body: "" },
      { ...ok, body: " \n\n  " },
      { ...ok, body: "가".repeat(5001) },
      { ...ok, pinned: "yes" },
      { ...ok, slug: "Bad Slug!" },
      { title: "제목", body: "본문", pinned: false }, // slug 칸 빠짐
      { ...ok, author: "모아" }, // 모르는 칸
    ];
    for (const body of bad) {
      const { calls, client } = fakeClient({ error: null });
      expect((await saveNotice(client, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-K11: 본문 앞뒤 공백을 떼고 DB 에 넘긴다", async () => {
    const { calls, client } = fakeClient({ data: "n-1", error: null });
    await saveNotice(client, { slug: null, title: "제목", body: "\n  본문  \n\n", pinned: false });
    expect(calls[0]?.args).toMatchObject({ p_body: "본문" });
  });

  it("INV-K11 (실패경로): 본문 5000자는 앞뒤 공백을 떼기 전에 센다(DB 와 같은 순서) — 「공백 + 5000자」는 400", async () => {
    const { calls, client } = fakeClient({ error: null });
    expect((await saveNotice(client, { slug: null, title: "제목", body: ` ${"가".repeat(5000)}`, pinned: false })).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("INV-K11: slug — 40자는 받고, 41자·빈 slug 는 400", async () => {
    const ok = fakeClient({ data: "a", error: null });
    expect((await saveNotice(ok.client, { slug: "a".repeat(40), title: "제목", body: "본문", pinned: false })).status).toBe(200);
    for (const slug of ["a".repeat(41), ""]) {
      const { calls, client } = fakeClient({ error: null });
      expect((await saveNotice(client, { slug, title: "제목", body: "본문", pinned: false })).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-K11: 경계값 — 제목 100자·본문 5000자는 받는다", async () => {
    const { calls, client } = fakeClient({ data: "n-1", error: null });
    expect((await saveNotice(client, { slug: null, title: "가".repeat(100), body: "나".repeat(5000), pinned: false })).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("INV-K11 (실패경로): DB 오류 코드 — 42501→403, 22023→400, P0002→404, 그 밖→500", async () => {
    for (const [code, status] of [
      ["42501", 403],
      ["22023", 400],
      ["P0002", 404],
      ["XX000", 500],
    ] as const) {
      const { client } = fakeClient({ error: { code } });
      expect((await saveNotice(client, { slug: "a-1", title: "제목", body: "본문", pinned: false })).status).toBe(status);
    }
  });
});
