import { describe, expect, it } from "vitest";
import { saveTagOptions } from "./save-tag-options";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

/** 로그인한 사람의 세션 클라이언트 대역. 운영자 판정(is_operator·is_owner)은 operator 로, 쓰기 함수는 reply 로 답한다. */
function fakeClient(reply: { data?: unknown; error: { code: string } | null }, operator = true) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: operator, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error };
    },
  } as never;
  return { calls, client };
}

describe("태그 선택지 관리 (creator-tags INV-T1·T5)", () => {
  it("INV-T1 S1: 운영자(직원 포함)가 추가·이름 고치기·숨기기·보이기·순서를 각각의 DB 함수로 — 앞뒤 공백을 뗀다", async () => {
    const cases: [unknown, string, unknown][] = [
      [{ kind: "add", name: " 팬더TV " }, "admin_add_creator_tag_option", { p_name: "팬더TV" }],
      [{ kind: "rename", id: ID, name: "X(트위터)" }, "admin_rename_creator_tag_option", { p_id: ID, p_name: "X(트위터)" }],
      [{ kind: "hide", id: ID, hidden: true }, "admin_set_creator_tag_option_hidden", { p_id: ID, p_hidden: true }],
      [{ kind: "hide", id: ID, hidden: false }, "admin_set_creator_tag_option_hidden", { p_id: ID, p_hidden: false }],
      [{ kind: "move", id: ID, up: true }, "admin_move_creator_tag_option", { p_id: ID, p_up: true }],
    ];
    for (const [body, fn, args] of cases) {
      const { calls, client } = fakeClient({ error: null });
      expect((await saveTagOptions(client, body)).status).toBe(200);
      expect(calls).toEqual([{ fn, args }]);
    }
  });

  it("INV-T5 S5: 「선택지에 넣기」는 그 말 하나만 DB 의 한 함수로 넘긴다 — 크리에이터 목록은 DB 가 찾는다", async () => {
    const { calls, client } = fakeClient({ data: ID, error: null });
    expect(await saveTagOptions(client, { kind: "promote", tag: " 팝콘TV " })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "admin_promote_custom_creator_tag", args: { p_tag: "팝콘TV" } }]);
  });

  it("INV-T1 S1b · INV-T5 S5b (실패경로): 운영자가 아니면(크리에이터·팬·손님) 404 — 쓰기 함수를 부르지 않는다", async () => {
    for (const body of [
      { kind: "add", name: "팬더TV" },
      { kind: "hide", id: ID, hidden: true },
      { kind: "promote", tag: "팝콘TV" },
    ]) {
      const { calls, client } = fakeClient({ error: null }, false);
      expect(await saveTagOptions(client, body)).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
      expect(calls).toEqual([]);
    }
  });

  it("INV-T1 (실패경로): 꼴이 틀리거나 이름이 1~20자가 아니면 DB 를 부르지 않고 400", async () => {
    for (const body of [
      null,
      { kind: "add", name: "" },
      { kind: "add", name: "   " },
      { kind: "add", name: "가".repeat(21) },
      { kind: "add", name: "팬더​TV" },
      { kind: "rename", id: "not-a-uuid", name: "X" },
      { kind: "hide", id: ID },
      { kind: "move", id: ID, up: "up" },
      { kind: "promote", tag: "" },
      { kind: "add", name: "팬더TV", position: 1 }, // 모르는 칸
      { kind: "delete", id: ID },
    ]) {
      const { calls, client } = fakeClient({ error: null });
      expect([body, (await saveTagOptions(client, body)).status]).toEqual([body, 400]);
      expect(calls).toEqual([]);
    }
  });

  it("INV-T1 (실패경로): 같은 이름이 있으면(55000) 409 문구, DB 가 운영자가 아니라고 하면(42501) 403", async () => {
    const dup = await saveTagOptions(fakeClient({ error: { code: "55000" } }).client, { kind: "add", name: "soop" });
    expect(dup).toEqual({ status: 409, body: { message: "같은 이름의 선택지가 이미 있어요." } });
    expect((await saveTagOptions(fakeClient({ error: { code: "42501" } }).client, { kind: "add", name: "팬더TV" })).status).toBe(403);
  });
});

describe("금칙어·직접 입력 지우기 (creator-tags INV-T7·T8)", () => {
  it("INV-T8 S8: 금칙어 추가·삭제, 직접 입력 지우기를 각각의 DB 함수로 — 앞뒤 공백을 뗀다", async () => {
    const cases: [unknown, string, unknown][] = [
      [{ kind: "ban_add", word: " 광고 " }, "admin_add_tag_banned_word", { p_word: "광고" }],
      [{ kind: "ban_remove", id: ID }, "admin_remove_tag_banned_word", { p_id: ID }],
      [{ kind: "delete_custom", tag: " 광고문구 " }, "admin_delete_custom_creator_tag", { p_tag: "광고문구" }],
    ];
    for (const [body, fn, args] of cases) {
      const { calls, client } = fakeClient({ error: null });
      expect((await saveTagOptions(client, body)).status).toBe(200);
      expect(calls).toEqual([{ fn, args }]);
    }
  });

  it("INV-T8 (실패경로): 이미 있는 금칙어(같은 비교 키)는 409, 운영자가 아니면 404 — 쓰기 함수를 부르지 않는다", async () => {
    expect(await saveTagOptions(fakeClient({ error: { code: "23505" } }).client, { kind: "ban_add", word: "광고" })).toEqual({
      status: 409,
      body: { message: "이미 있는 금칙어예요." },
    });
    for (const body of [{ kind: "ban_add", word: "광고" }, { kind: "ban_remove", id: ID }, { kind: "delete_custom", tag: "광고" }]) {
      const { calls, client } = fakeClient({ error: null }, false);
      expect((await saveTagOptions(client, body)).status).toBe(404);
      expect(calls).toEqual([]);
    }
  });

  it("INV-T7 S7c (실패경로): 선택지 이름이 필터에 걸리면 400 과 사유 문구", async () => {
    expect(await saveTagOptions(fakeClient({ error: { code: "P0082" } }).client, { kind: "add", name: "a@b.kr" })).toEqual({
      status: 400,
      body: { message: "태그에 전화번호·이메일·인터넷 주소를 입력할 수 없습니다." },
    });
  });
});
