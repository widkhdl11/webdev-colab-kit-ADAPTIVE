// @vitest-environment node
import { describe, expect, it } from "vitest";
import { acceptRevgiftWithAddress } from "./accept-revgift";

// reverse-gift INV-R4·R5·R6: 받기는 받기 창에서 봉인한 주소를 그 몫에 넣는다 — 팬 등록 주소는 없다(2026-11-08, address-protection INV-P17).

const SEALED = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: btoa("k".repeat(256)), iv: btoa("i".repeat(12)), ciphertext: btoa("c".repeat(40)) };
const ORDER = "RG-ABCDE1";

function fakeClient(error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        return { data: null, error };
      },
    } as never,
  };
}

describe("reverse-gift INV-R4: 받기 때 입력한 주소", () => {
  it("INV-R4 (S4): 봉인된 주소를 받기 함수에 그대로 넘긴다", async () => {
    const { client, calls } = fakeClient();
    expect(await acceptRevgiftWithAddress({ client }, ORDER, { address: SEALED })).toEqual({ status: 200, body: { accepted: true } });
    expect(calls).toEqual([{ fn: "accept_revgift", args: { p_order_no: ORDER, p_envelope: SEALED } }]);
  });

  it("INV-R5 (S5b, 실패경로): 봉인이 없거나 평문이면 400 — 받기 함수를 부르지 않는다", async () => {
    for (const body of [{}, null, { address: "서울시 마포구 1" }, { address: { ...SEALED, v: 2 } }]) {
      const { client, calls } = fakeClient();
      expect((await acceptRevgiftWithAddress({ client }, ORDER, body)).status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("INV-R4 (S4b·S4d, 실패경로): 남의·없는 몫은 404, 이미 정했거나 기한이 지났으면 409, DB 가 봉인을 거부하면 400", async () => {
    expect((await acceptRevgiftWithAddress({ client: fakeClient({ code: "P0002" }).client }, ORDER, { address: SEALED })).status).toBe(404);
    expect((await acceptRevgiftWithAddress({ client: fakeClient({ code: "P0022" }).client }, ORDER, { address: SEALED })).status).toBe(409);
    expect((await acceptRevgiftWithAddress({ client: fakeClient({ code: "22023" }).client }, ORDER, { address: SEALED })).status).toBe(400);
  });

  it("주문번호 꼴이 아니면 404 — 부르지 않는다", async () => {
    const { client, calls } = fakeClient();
    expect((await acceptRevgiftWithAddress({ client }, "../x", { address: SEALED })).status).toBe(404);
    expect(calls).toEqual([]);
  });
});
