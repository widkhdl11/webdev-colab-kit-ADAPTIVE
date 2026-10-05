// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { saveCreatorAddress } from "./save-creator-address";

const HARU = { userId: "00000000-0000-4000-a000-000000000011", role: "creator" } as const;
const signer = chooseApprovalSigner({ NODE_ENV: "test" });

let envelope: Envelope;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
  envelope = JSON.parse(JSON.stringify(await sealEnvelope("{\"address1\":\"서울시 강남구 테헤란로 123\"}", pair.publicKey))) as Envelope;
});

function fakeAdmin(result: { data?: unknown; error?: { code: string } | null } = { data: "saved" }) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    admin: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data: result.data ?? null, error: result.error ?? null };
      },
    } as never,
  };
}

describe("크리에이터 주소 등록·변경 (address-protection INV-P13)", () => {
  it("INV-P13 S13: 로그인한 크리에이터의 ID 와 봉인 하나, 서명 방식을 저장 함수에 넘긴다", async () => {
    const f = fakeAdmin();
    expect(await saveCreatorAddress({ admin: f.admin, viewer: HARU, signer }, { address: envelope })).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "set_creator_address", args: { p_actor_id: HARU.userId, p_envelope: envelope, p_method: "fake" } },
    ]);
  });

  it("INV-P13 S13c: 본문에 다른 크리에이터 값을 붙여도 세션의 크리에이터로만 저장한다", async () => {
    const f = fakeAdmin();
    const body = { address: envelope, actorId: "someone", creatorId: "00000000-0000-4000-b000-000000000002", p_actor_id: "x", method: "kakao" };
    expect(await saveCreatorAddress({ admin: f.admin, viewer: HARU, signer }, body)).toEqual({ ok: true });
    expect(f.calls).toEqual([
      { fn: "set_creator_address", args: { p_actor_id: HARU.userId, p_envelope: envelope, p_method: "fake" } },
    ]);
  });

  it("INV-P13 S13c (실패경로): 로그인하지 않았으면 401, 팬·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "f", role: "fan" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeAdmin();
      expect(await saveCreatorAddress({ admin: f.admin, viewer, signer }, { address: envelope })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P13 S13d (실패경로): 서명 창구가 없으면(운영) 503 — DB 를 부르지 않는다", async () => {
    const f = fakeAdmin();
    expect(await saveCreatorAddress({ admin: f.admin, viewer: HARU, signer: null }, { address: envelope })).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(f.calls).toEqual([]);
  });

  it("INV-P13 S13d (실패경로): 운영 표시로 고른 창구로는 저장하지 않는다", async () => {
    const f = fakeAdmin();
    const prodSigner = chooseApprovalSigner({ NODE_ENV: "production" });
    expect(await saveCreatorAddress({ admin: f.admin, viewer: HARU, signer: prodSigner }, { address: envelope })).toMatchObject({
      ok: false,
      status: 503,
    });
    expect(f.calls).toEqual([]);
  });

  it("INV-P1·P13 S13b (실패경로): 평문 주소·봉인 형식이 아닌 값은 400 — DB 를 부르지 않는다", async () => {
    for (const body of [
      { address: "서울시 강남구 테헤란로 123" },
      { address: { ...envelope, ciphertext: "서울시 강남구" } },
      { address: { ...envelope, extra: 1 } },
      { envelope },
      envelope,
      {},
      null,
      "서울시 강남구 테헤란로 123",
    ]) {
      const f = fakeAdmin();
      expect(await saveCreatorAddress({ admin: f.admin, viewer: HARU, signer }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("DB 결과를 문구로 — 크리에이터 아님 403, 방식 거부 503, 형식 오류 400, 모르는 결과·오류는 던진다", async () => {
    const run = (r: Parameters<typeof fakeAdmin>[0]) => saveCreatorAddress({ admin: fakeAdmin(r).admin, viewer: HARU, signer }, { address: envelope });
    expect(await run({ data: "not_creator" })).toMatchObject({ ok: false, status: 403 });
    expect(await run({ data: "method_refused" })).toMatchObject({ ok: false, status: 503 });
    expect(await run({ error: { code: "22023" } })).toMatchObject({ ok: false, status: 400 });
    await expect(run({ data: "weird" })).rejects.toThrow();
    await expect(run({ error: { code: "42501" } })).rejects.toThrow();
  });
});
