// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { deleteFanAddress, saveFanAddress } from "./save-fan-address";

const BYEOLBIT = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;

let envelope: Envelope;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false,
    ["encrypt", "decrypt"],
  );
  envelope = JSON.parse(JSON.stringify(await sealEnvelope('{"address1":"서울시 마포구 어울마당로 1"}', pair.publicKey))) as Envelope;
});

function fakeClient(result: { data?: unknown; error?: { code: string } | null } = { data: "saved" }) {
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

describe("팬 받을 주소 등록·변경 (address-protection INV-P1·P16·P17)", () => {
  it("INV-P17 S17: 봉인 하나와 고른 이름표만 저장 함수에 넘긴다 — 누구의 칸인지는 로그인 토큰이 정한다", async () => {
    const f = fakeClient();
    expect(await saveFanAddress({ client: f.client, viewer: BYEOLBIT }, { address: envelope, label: "home" })).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "set_my_fan_address", args: { p_envelope: envelope, p_label: "home" } }]);
  });

  it("INV-P17 S17b: 본문에 다른 계정 값을 붙여도 저장 함수에는 넘기지 않는다", async () => {
    const f = fakeClient();
    const body = { address: envelope, label: "studio", accountId: "00000000-0000-4000-a000-000000000002", p_account_id: "x" };
    expect(await saveFanAddress({ client: f.client, viewer: BYEOLBIT }, body)).toEqual({ ok: true });
    expect(f.calls).toEqual([{ fn: "set_my_fan_address", args: { p_envelope: envelope, p_label: "studio" } }]);
  });

  it("INV-P17 S17b (실패경로): 로그인하지 않았으면 401, 크리에이터·운영자면 403 — DB 를 부르지 않는다", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "c", role: "creator" }, 403],
      [{ userId: "o", role: "operator" }, 403],
    ] as const) {
      const f = fakeClient();
      expect(await saveFanAddress({ client: f.client, viewer }, { address: envelope, label: "home" })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P1 S17b (실패경로): 평문 주소·봉인 형식이 아닌 값은 400 — DB 를 부르지 않는다", async () => {
    for (const body of [{ address: "서울시 마포구 어울마당로 1", label: "home" }, { address: { ...envelope, iv: "AAAA" }, label: "home" }, null, {}]) {
      const f = fakeClient();
      expect(await saveFanAddress({ client: f.client, viewer: BYEOLBIT }, body)).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P16 S17b (실패경로): 이름표가 없거나 목록 밖(주소 글자 포함)이면 400 — DB 를 부르지 않는다", async () => {
    for (const label of [undefined, "", "역삼동 집", "HOME"]) {
      const f = fakeClient();
      expect(await saveFanAddress({ client: f.client, viewer: BYEOLBIT }, { address: envelope, label })).toEqual({
        ok: false,
        status: 400,
        message: "주소 별칭을 선택해 주세요.",
      });
      expect(f.calls).toEqual([]);
    }
  });

  it("INV-P17 (실패경로): DB 가 팬이 아니라고 하면 403, 형식 오류면 400, 모르는 답·그 밖의 오류는 던진다", async () => {
    const body = { address: envelope, label: "home" };
    expect(await saveFanAddress({ client: fakeClient({ data: "not_fan" }).client, viewer: BYEOLBIT }, body)).toMatchObject({ ok: false, status: 403 });
    expect(await saveFanAddress({ client: fakeClient({ error: { code: "22023" } }).client, viewer: BYEOLBIT }, body)).toMatchObject({
      ok: false,
      status: 400,
    });
    await expect(saveFanAddress({ client: fakeClient({ data: "ok" }).client, viewer: BYEOLBIT }, body)).rejects.toThrow();
    await expect(saveFanAddress({ client: fakeClient({ error: { code: "42501" } }).client, viewer: BYEOLBIT }, body)).rejects.toThrow();
  });
});

describe("팬 받을 주소 지우기 (address-protection INV-P17)", () => {
  it("INV-P17 S17c: 로그인한 팬이면 지우기 함수를 인자 없이 부른다 — 이미 비어 있어도 성공", async () => {
    for (const data of ["deleted", "none"]) {
      const f = fakeClient({ data });
      expect(await deleteFanAddress({ client: f.client, viewer: BYEOLBIT })).toEqual({ ok: true });
      expect(f.calls).toEqual([{ fn: "delete_my_fan_address", args: undefined }]);
    }
  });

  it("INV-P17 (실패경로): 로그인 안 함 401, 팬이 아니면 403 — DB 를 부르지 않는다. DB 가 팬이 아니라고 하면 403", async () => {
    for (const [viewer, status] of [
      [null, 401],
      [{ userId: "c", role: "creator" }, 403],
    ] as const) {
      const f = fakeClient({ data: "deleted" });
      expect(await deleteFanAddress({ client: f.client, viewer })).toMatchObject({ ok: false, status });
      expect(f.calls).toEqual([]);
    }
    expect(await deleteFanAddress({ client: fakeClient({ data: "not_fan" }).client, viewer: BYEOLBIT })).toMatchObject({ ok: false, status: 403 });
    await expect(deleteFanAddress({ client: fakeClient({ error: { code: "42501" } }).client, viewer: BYEOLBIT })).rejects.toThrow();
  });
});
