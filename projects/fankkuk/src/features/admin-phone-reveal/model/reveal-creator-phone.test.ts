import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptPhone, readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { revealCreatorPhone } from "./reveal-creator-phone";

const KEYS = readPhoneKeys({ FANKKUK_PHONE_ENC_KEY: randomBytes(32).toString("base64"), FANKKUK_PHONE_HASH_KEY: randomBytes(32).toString("base64") });
const CREATOR = "haru_creator";
const ACCOUNT = "00000000-0000-4000-8000-0000000000b1";
const PHONE = "01012345678";

type Call = { fn: string; args: Record<string, unknown> };

function client(opts: { access: "staff" | "owner" | "none"; reveal?: { data: unknown; error: { code: string } | null } }) {
  const calls: Call[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args });
      if (fn === "is_operator") return { data: opts.access !== "none", error: null };
      if (fn === "is_owner") return { data: opts.access === "owner", error: null };
      if (fn === "admin_reveal_phone") return opts.reveal ?? { data: [{ account_id: ACCOUNT, phone_sealed: encryptPhone(KEYS, ACCOUNT, PHONE) }], error: null };
      throw new Error(fn);
    },
  };
}

const deps = (c: ReturnType<typeof client>) => ({ client: c as unknown as Parameters<typeof revealCreatorPhone>[0]["client"], phoneKeys: () => KEYS });

describe("대표 「전화번호 보기」 (admin-console INV-K14)", () => {
  it("INV-K14: 대표면 그 크리에이터의 원래 번호를 보기 좋은 꼴로 돌려준다 — 암호문·계정 ID 는 응답에 없다", async () => {
    const c = client({ access: "owner" });
    const r = await revealCreatorPhone(deps(c), { loginId: CREATOR });
    expect(r).toEqual({ status: 200, body: { phone: "010-1234-5678" } });
    expect(c.calls.filter((x) => x.fn === "admin_reveal_phone")).toEqual([{ fn: "admin_reveal_phone", args: { p_login_id: CREATOR } }]);
    expect(JSON.stringify(r)).not.toContain("v1.");
    expect(JSON.stringify(r)).not.toContain(ACCOUNT);
  });

  it("INV-K14 실패경로: 직원이 보내면 DB 를 부르지 않고 거부한다(접속 기록도 생기지 않는다)", async () => {
    const c = client({ access: "staff" });
    const r = await revealCreatorPhone(deps(c), { loginId: CREATOR });
    expect(r.status).toBe(403);
    expect(c.calls.some((x) => x.fn === "admin_reveal_phone")).toBe(false);
    expect(JSON.stringify(r)).not.toContain("1234");
  });

  it("INV-K14 실패경로: 운영자가 아니면 없는 주소(404)", async () => {
    const c = client({ access: "none" });
    expect((await revealCreatorPhone(deps(c), { loginId: CREATOR })).status).toBe(404);
    expect(c.calls.some((x) => x.fn === "admin_reveal_phone")).toBe(false);
  });

  it("INV-K14 실패경로: DB 가 대표가 아니라고 거부하면(42501) 403, 번호 없음", async () => {
    const c = client({ access: "owner", reveal: { data: null, error: { code: "42501" } } });
    const r = await revealCreatorPhone(deps(c), { loginId: CREATOR });
    expect(r.status).toBe(403);
    expect(r.body).not.toHaveProperty("phone");
  });

  it("INV-K14: 번호가 없는 크리에이터면 404(기록도 DB 가 남기지 않는다)", async () => {
    const c = client({ access: "owner", reveal: { data: [], error: null } });
    expect((await revealCreatorPhone(deps(c), { loginId: CREATOR })).status).toBe(404);
  });

  it("INV-K14 실패경로: 암호문이 풀리지 않으면(다른 계정에 묶임·키 틀림) 번호를 돌려주지 않고 500", async () => {
    const wrong = encryptPhone(KEYS, "00000000-0000-4000-8000-0000000000ff", PHONE);
    const c = client({ access: "owner", reveal: { data: [{ account_id: ACCOUNT, phone_sealed: wrong }], error: null } });
    const r = await revealCreatorPhone(deps(c), { loginId: CREATOR });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r)).not.toContain("5678");
  });

  it("INV-K14 실패경로: 아이디 꼴이 아니면 DB 를 부르지 않고 400", async () => {
    const c = client({ access: "owner" });
    expect((await revealCreatorPhone(deps(c), { loginId: "X y" })).status).toBe(400);
    expect((await revealCreatorPhone(deps(c), { loginId: CREATOR, extra: 1 })).status).toBe(400);
    expect(c.calls.some((x) => x.fn === "admin_reveal_phone")).toBe(false);
  });
});
