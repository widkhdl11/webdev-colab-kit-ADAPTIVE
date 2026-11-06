import { describe, expect, it } from "vitest";
import { readAdminPhoneMasks } from "./read-admin-phone-masks";

type Client = Parameters<typeof readAdminPhoneMasks>[0];

const A = "haru_creator";
const B = "momo_creator";

function client(data: unknown, error: { code: string } | null = null) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const fake = { calls, rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data, error }) };
  return fake as typeof fake & Client;
}

describe("운영자 크리에이터 목록의 가린 번호 (admin-console INV-K14)", () => {
  it("INV-K14: 크리에이터 아이디마다 가린 번호(앞 3자리-****-뒤 4자리)를 돌려준다", async () => {
    const c = client([{ login_id: A, phone_masked: "010-****-5678" }]);
    const masks = await readAdminPhoneMasks(c, [A, B, A]);
    expect(c.calls).toEqual([{ fn: "admin_phone_masks", args: { p_login_ids: [A, B] } }]);
    expect(masks.get(A)).toBe("010-****-5678");
    expect(masks.has(B)).toBe(false);
  });

  it("INV-K14 실패경로: 가린 꼴이 아닌 값(가운데가 보이는 번호)은 버린다", async () => {
    const c = client([{ login_id: A, phone_masked: "010-1234-5678" }]);
    await expect(readAdminPhoneMasks(c, [A])).rejects.toThrow();
  });

  it("빈 목록이면 DB 를 부르지 않는다 · DB 오류면 던진다", async () => {
    const c = client([]);
    expect((await readAdminPhoneMasks(c, [])).size).toBe(0);
    expect(c.calls).toHaveLength(0);
    await expect(readAdminPhoneMasks(client(null, { code: "42501" }), [A])).rejects.toThrow();
  });
});
