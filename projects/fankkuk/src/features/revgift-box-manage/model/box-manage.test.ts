// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cancelBox, closeBox, createBox, renewInvite, setExcluded } from "./box-manage";

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const BYEOLBIT = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;
const BOX = "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10";
const APP = "0d9c4a1e-6b2f-4f3a-8e7d-1c2b3a4d5e6f";

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

describe("선물함 만들기 (revgift-box INV-GB3)", () => {
  it("INV-GB3 S3: 이름·받을 인원·공개 여부 셋만 넘긴다 — 누구의 선물함인지는 로그인 토큰이 정한다", async () => {
    const f = fakeClient({ data: { id: BOX, invite_token: "a".repeat(32) } });
    const r = await createBox({ client: f.client, viewer: HARU }, { name: " 겨울 선물 ", capacity: 30, isPublic: false, creatorId: "x", ownerId: "y" });
    expect(r).toEqual({ ok: true, boxId: BOX });
    expect(f.calls).toEqual([{ fn: "create_revgift_box", args: { p_name: "겨울 선물", p_capacity: 30, p_is_public: false } }]);
  });

  it("INV-GB3 S3b: 팬·로그인 안 함은 부르지도 않는다, 꼴이 틀리면 400, DB 의 22023·42501 은 400·403", async () => {
    const f = fakeClient();
    expect(await createBox({ client: f.client, viewer: BYEOLBIT }, { name: "a", capacity: 1, isPublic: true })).toMatchObject({ ok: false, status: 403 });
    expect(await createBox({ client: f.client, viewer: null }, { name: "a", capacity: 1, isPublic: true })).toMatchObject({ ok: false, status: 401 });
    for (const body of [{ name: "", capacity: 1, isPublic: true }, { name: "a", capacity: 1.5, isPublic: true }, { name: "a", capacity: "3", isPublic: true }, { name: "a", capacity: 3 }, null]) {
      expect(await createBox({ client: f.client, viewer: HARU }, body)).toMatchObject({ ok: false, status: 400 });
    }
    expect(f.calls).toEqual([]);
    expect(await createBox({ client: fakeClient({ error: { code: "22023" } }).client, viewer: HARU }, { name: "a", capacity: 101, isPublic: true })).toMatchObject({ ok: false, status: 400 });
    expect(await createBox({ client: fakeClient({ error: { code: "42501" } }).client, viewer: HARU }, { name: "a", capacity: 1, isPublic: true })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("신청 관리 (revgift-box INV-GB5·GB7·GB8·GB1)", () => {
  it("INV-GB7 S7: 제외·다시 넣기는 신청 번호와 제외 여부만 넘긴다", async () => {
    const f = fakeClient({ data: "excluded" });
    expect(await setExcluded({ client: f.client, viewer: HARU }, BOX, { applicationId: APP, excluded: true })).toEqual({ ok: true, status: "excluded" });
    expect(f.calls).toEqual([{ fn: "revgift_box_set_excluded", args: { p_box_id: BOX, p_application_id: APP, p_excluded: true } }]);
  });

  it("INV-GB5 S5b · INV-GB7 S7b: 다 참 409 · 남의 선물함 404 · 마감 뒤 409 — 서로 다른 문구", async () => {
    const full = await setExcluded({ client: fakeClient({ error: { code: "P0023" } }).client, viewer: HARU }, BOX, { applicationId: APP, excluded: false });
    const other = await setExcluded({ client: fakeClient({ error: { code: "P0002" } }).client, viewer: HARU }, BOX, { applicationId: APP, excluded: false });
    const late = await setExcluded({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: HARU }, BOX, { applicationId: APP, excluded: false });
    expect([full, other, late].map((r) => (r.ok ? 0 : r.status))).toEqual([409, 404, 409]);
    expect(new Set([full, other, late].map((r) => (r.ok ? "" : r.message))).size).toBe(3);
    expect(await setExcluded({ client: fakeClient().client, viewer: HARU }, "x", { applicationId: APP, excluded: true })).toMatchObject({ ok: false, status: 404 });
    expect(await setExcluded({ client: fakeClient().client, viewer: HARU }, BOX, { applicationId: APP })).toMatchObject({ ok: false, status: 400 });
  });

  it("INV-GB8 S8b·S8c: 마감 — 넣을 대기 신청 번호만 넘긴다(겹치면 하나로), 본문이 없으면 빈 목록. 0명이어도 담긴 수 0 으로 성공", async () => {
    const W = "1f2e3d4c-5b6a-4789-8abc-def012345678";
    const f = fakeClient({ data: 3 });
    expect(await closeBox({ client: f.client, viewer: HARU }, BOX, { waitlisted: [W, W], selected: 99 })).toEqual({ ok: true, selected: 3 });
    expect(await closeBox({ client: fakeClient({ data: 0 }).client, viewer: HARU }, BOX)).toEqual({ ok: true, selected: 0 });
    await closeBox({ client: f.client, viewer: HARU }, BOX, null);
    expect(f.calls).toEqual([
      { fn: "revgift_box_close", args: { p_box_id: BOX, p_waitlisted: [W] } },
      { fn: "revgift_box_close", args: { p_box_id: BOX, p_waitlisted: [] } },
    ]);
  });

  it("INV-GB8 S8d (실패경로): 넣을 목록 꼴이 틀리면 400 — DB 를 부르지 않는다. DB 가 목록을 거부(P0028)하면 409 와 다른 문구", async () => {
    const f = fakeClient();
    for (const body of [{ waitlisted: ["x"] }, { waitlisted: "a" }, { waitlisted: [1] }]) {
      expect(await closeBox({ client: f.client, viewer: HARU }, BOX, body)).toMatchObject({ ok: false, status: 400 });
    }
    expect(f.calls).toEqual([]);
    const bad = await closeBox({ client: fakeClient({ error: { code: "P0028" } }).client, viewer: HARU }, BOX, { waitlisted: [] });
    const late = await closeBox({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: HARU }, BOX, { waitlisted: [] });
    expect([bad, late].map((r) => (r.ok ? 0 : r.status))).toEqual([409, 409]);
    expect(bad.ok || late.ok ? "" : bad.message === late.message).toBe(false);
    // 옛 오류(제외 안 된 신청 없음)는 더 오지 않는다 — 오면 던진다
    await expect(closeBox({ client: fakeClient({ error: { code: "P0024" } }).client, viewer: HARU }, BOX)).rejects.toThrow();
  });

  it("INV-GB1: 선물함 취소·링크 다시 만들기 — 팬은 부르지 않는다, 상태가 맞지 않으면 409", async () => {
    const f = fakeClient();
    expect(await cancelBox({ client: f.client, viewer: BYEOLBIT }, BOX)).toMatchObject({ ok: false, status: 403 });
    expect(f.calls).toEqual([]);
    expect(await cancelBox({ client: fakeClient().client, viewer: HARU }, BOX)).toEqual({ ok: true });
    expect(await cancelBox({ client: fakeClient({ error: { code: "P0022" } }).client, viewer: HARU }, BOX)).toMatchObject({ ok: false, status: 409 });
    expect(await renewInvite({ client: fakeClient({ data: "b".repeat(32) }).client, viewer: HARU }, BOX)).toEqual({ ok: true, token: "b".repeat(32) });
  });

  it("모르는 오류는 던진다 — 성공으로 치지 않는다", async () => {
    await expect(closeBox({ client: fakeClient({ error: { code: "XX000" } }).client, viewer: HARU }, BOX)).rejects.toThrow();
    await expect(closeBox({ client: fakeClient({ data: "3" }).client, viewer: HARU }, BOX)).rejects.toThrow();
  });
});
