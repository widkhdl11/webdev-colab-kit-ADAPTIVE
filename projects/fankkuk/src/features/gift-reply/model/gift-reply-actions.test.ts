import { describe, expect, it } from "vitest";
import { confirmGiftBox, deleteGiftReply, saveReplyConsent } from "./gift-reply-actions";

// 받았어요·답장·지우기·공개 동의 저장 (gift-reply INV-G1·G3·G4·G8). 서버는 세션 클라이언트로 DB 함수를 부른다 —
// DB 가 로그인 토큰으로 사람을 정하고 모든 규칙을 다시 검사한다. 여기서는 넘기는 칸·역할 거부·오류 문구 갈래를 본다.

const HARU = { userId: "creator-haru", role: "creator" } as const;
const FAN = { userId: "fan-x", role: "fan" } as const;
const BOX = "6f1c2a52-0d55-4f0e-9a51-3f7a1f0d2b11";

function fakeClient(result: { data?: unknown; error?: { code: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

describe("받았어요·답장 보내기 (INV-G1·G3)", () => {
  it("INV-G1: 상자·문구·한 줄만 넘긴다 — 본문의 크리에이터·팬 칸은 넘기지 않는다. 한 줄은 앞뒤 공백을 뺀다", async () => {
    const f = fakeClient({ data: "replied" });
    const r = await confirmGiftBox({ client: f.client, viewer: HARU }, { boxId: BOX, phrase: "thanks", line: "  고마워요  ", creatorId: "c2", fanId: "f" });
    expect(r).toEqual({ ok: true, result: "replied" });
    expect(f.calls).toEqual([{ fn: "confirm_gift_box", args: { p_box_id: BOX, p_phrase: "thanks", p_line: "고마워요" } }]);
  });

  it("INV-G1: 확인만은 문구·한 줄 없이", async () => {
    const f = fakeClient({ data: "received" });
    expect(await confirmGiftBox({ client: f.client, viewer: HARU }, { boxId: BOX, phrase: null })).toEqual({ ok: true, result: "received" });
    expect(f.calls[0].args).toEqual({ p_box_id: BOX, p_phrase: null, p_line: null });
  });

  it("INV-G1 (실패경로): 로그인 안 함 401, 팬 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [FAN, 403],
    ] as const) {
      const f = fakeClient({ data: "received" });
      expect(await confirmGiftBox({ client: f.client, viewer }, { boxId: BOX, phrase: null })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-G3 (실패경로): 목록 밖 문구·81자·줄바꿈·문구 없는 한 줄은 DB 를 부르기 전에 400", async () => {
    for (const body of [
      { boxId: BOX, phrase: "잘 받았어요, 고마워요" },
      { boxId: BOX, phrase: "thanks", line: "가".repeat(81) },
      { boxId: BOX, phrase: "thanks", line: "첫 줄\n둘째 줄" },
      { boxId: BOX, phrase: null, line: "한 줄만" },
      { boxId: "x", phrase: null },
    ]) {
      const f = fakeClient({ data: "replied" });
      expect(await confirmGiftBox({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-G1·G2·G3·G4: DB 오류 코드마다 사람이 읽는 문구로 — 남의 상자는 404, 출고 전·이미 답장·지운 답장·필터는 400", async () => {
    const cases: [string, number, RegExp][] = [
      ["P0002", 404, /찾을 수 없/],
      ["P0100", 400, /출고/],
      ["P0101", 400, /이미 답장/],
      ["P0102", 400, /지운 답장/],
      ["P0081", 400, /쓸 수 없는 말/],
      ["P0082", 400, /전화번호/],
      ["22023", 400, /확인/],
      ["42501", 401, /로그인/],
    ];
    for (const [code, status, message] of cases) {
      const r = await confirmGiftBox({ client: fakeClient({ error: { code } }).client, viewer: HARU }, { boxId: BOX, phrase: "thanks", line: "고마워요" });
      expect(r, code).toMatchObject({ ok: false, status });
      if (!r.ok) expect(r.message).toMatch(message);
    }
    await expect(confirmGiftBox({ client: fakeClient({ error: { code: "XX000" } }).client, viewer: HARU }, { boxId: BOX, phrase: null })).rejects.toThrow();
  });
});

describe("답장 지우기 (INV-G4)", () => {
  it("INV-G4: 상자 하나만 넘기고, 팬은 403", async () => {
    const f = fakeClient({ data: null });
    expect(await deleteGiftReply({ client: f.client, viewer: HARU }, { boxId: BOX })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "delete_gift_reply", args: { p_box_id: BOX } }]);
    const g = fakeClient({ data: null });
    expect(await deleteGiftReply({ client: g.client, viewer: FAN }, { boxId: BOX })).toMatchObject({ ok: false, status: 403 });
    expect(g.calls).toEqual([]);
  });

  it("INV-G4 (실패경로): 지울 답장이 없으면 400, 남의 상자는 404", async () => {
    expect(await deleteGiftReply({ client: fakeClient({ error: { code: "P0103" } }).client, viewer: HARU }, { boxId: BOX })).toMatchObject({ ok: false, status: 400 });
    expect(await deleteGiftReply({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: HARU }, { boxId: BOX })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("공개 동의 (INV-G8)", () => {
  it("INV-G8: 상자·두 칸만 넘긴다 — 크리에이터 계정이 보낸 선물도 있어 역할로 막지 않고 DB 가 보낸 사람인지 본다", async () => {
    for (const viewer of [FAN, HARU]) {
      const f = fakeClient({ data: [{ fan_public: true, fan_show_nickname: false }] });
      expect(await saveReplyConsent({ client: f.client, viewer }, { boxId: BOX, isPublic: true, showNickname: false, fanId: "other" })).toEqual({
        ok: true,
        consent: { isPublic: true, showNickname: false },
      });
      expect(f.calls).toEqual([{ fn: "set_gift_reply_consent", args: { p_box_id: BOX, p_public: true, p_show_nickname: false } }]);
    }
  });

  it("INV-G8: 고른 값을 그대로 넘기고, 돌려줄 값은 DB 가 저장한 값이다 — 공개를 끄면서 닉네임 보이기를 켜 보내도 DB 가 끈 값을 돌려준다", async () => {
    const f = fakeClient({ data: [{ fan_public: false, fan_show_nickname: false }] });
    expect(await saveReplyConsent({ client: f.client, viewer: FAN }, { boxId: BOX, isPublic: false, showNickname: true })).toEqual({
      ok: true,
      consent: { isPublic: false, showNickname: false },
    });
    expect(f.calls[0].args).toEqual({ p_box_id: BOX, p_public: false, p_show_nickname: true });
    // 저장 결과가 정해진 꼴이 아니면 성공으로 보지 않는다
    await expect(saveReplyConsent({ client: fakeClient({ data: null }).client, viewer: FAN }, { boxId: BOX, isPublic: true, showNickname: true })).rejects.toThrow();
  });

  it("INV-G8 S8 (실패경로): 로그인 안 함 401, 남의 답장 404, 꼴이 다르면 400", async () => {
    const f = fakeClient({ data: null });
    expect(await saveReplyConsent({ client: f.client, viewer: null }, { boxId: BOX, isPublic: true, showNickname: true })).toMatchObject({ ok: false, status: 401 });
    expect(await saveReplyConsent({ client: f.client, viewer: FAN }, { boxId: BOX, isPublic: "yes", showNickname: true })).toMatchObject({ ok: false, status: 400 });
    expect(f.calls).toEqual([]);
    expect(await saveReplyConsent({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: FAN }, { boxId: BOX, isPublic: true, showNickname: true })).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
