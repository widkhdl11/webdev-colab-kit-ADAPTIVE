// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyBox, withdrawBox } from "./box-apply";

const BYEOLBIT = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;
const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const BOX = "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10";
// 형식만 맞춘 봉인(복호화는 이 시험의 대상이 아니다)
const SEALED = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: btoa("k".repeat(256)), iv: btoa("i".repeat(12)), ciphertext: btoa("c".repeat(40)) };
const ADDR = { address: SEALED, region: "none" };

function fakeClient(result: { data?: unknown; error?: { code: string } | null } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

describe("선물함 신청 (revgift-box INV-GB4·GB5·GB6)", () => {
  it("INV-GB6 S6: 신청 때 입력한 봉인과 할증 구분을 그대로 넘긴다 — 다른 칸(번호·계정)은 읽지 않는다", async () => {
    const f = fakeClient({ data: "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f" });
    const r = await applyBox({ client: f.client, viewer: BYEOLBIT }, BOX, { token: "t".repeat(32), ...ADDR, region: "jeju", phone: "01012345678", fanId: HARU.userId });
    expect(r).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "revgift_box_apply", args: { p_box_id: BOX, p_token: "t".repeat(32), p_envelope: SEALED, p_region: "jeju" } }]);
  });

  it("INV-GB6 S6·S6b (실패경로): 봉인이 없거나(옛 「등록 주소 쓰기」) 평문·틀린 구분이면 400 — DB 를 부르지 않는다", async () => {
    for (const body of [{}, { region: "none" }, { address: "서울시 마포구 1", region: "none" }, { address: SEALED }, { address: SEALED, region: "63000" }]) {
      const f = fakeClient();
      expect(await applyBox({ client: f.client, viewer: BYEOLBIT }, BOX, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-GB4: 토큰이 없으면 null 로, 꼴이 틀린 토큰은 그대로 넘겨 DB 가 「없음」으로 답하게 한다", async () => {
    const f = fakeClient({ data: "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f" });
    await applyBox({ client: f.client, viewer: BYEOLBIT }, BOX, ADDR);
    await applyBox({ client: f.client, viewer: BYEOLBIT }, BOX, { ...ADDR, token: 3 });
    expect(f.calls.map((c) => (c.args as { p_token: unknown }).p_token)).toEqual([null, null]);
  });

  it("INV-GB4 S4b·S4c·S4d · INV-GB5 S5 · INV-GB8: DB 오류마다 상태와 문구가 다르다", async () => {
    const codes = ["P0002", "42501", "P0022", "P0023", "P0025", "P0027", "22023"];
    const replies = await Promise.all(codes.map((code) => applyBox({ client: fakeClient({ error: { code } }).client, viewer: BYEOLBIT }, BOX, ADDR)));
    expect(replies.map((r) => (r.ok ? 0 : r.status))).toEqual([404, 403, 409, 409, 403, 409, 400]);
    expect(new Set(replies.map((r) => (r.ok ? "" : r.message))).size).toBe(codes.length);
  });

  it("INV-GB4 S4d: 크리에이터·로그인 안 함은 부르지도 않는다", async () => {
    const f = fakeClient();
    expect(await applyBox({ client: f.client, viewer: HARU }, BOX, {})).toMatchObject({ ok: false, status: 403 });
    expect(await applyBox({ client: f.client, viewer: null }, BOX, {})).toMatchObject({ ok: false, status: 401 });
    expect(await applyBox({ client: f.client, viewer: BYEOLBIT }, "nope", {})).toMatchObject({ ok: false, status: 404 });
    expect(f.calls).toEqual([]);
  });

  it("Q5: 신청 취소 — 마감 뒤 409, 내 신청이 없으면 404", async () => {
    expect(await withdrawBox({ client: fakeClient().client, viewer: BYEOLBIT }, BOX)).toEqual({ ok: true });
    expect(await withdrawBox({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: BYEOLBIT }, BOX)).toMatchObject({ ok: false, status: 409 });
    expect(await withdrawBox({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: BYEOLBIT }, BOX)).toMatchObject({ ok: false, status: 404 });
    await expect(withdrawBox({ client: fakeClient({ error: { code: "42883" } }).client, viewer: BYEOLBIT }, BOX)).rejects.toThrow();
  });
});
