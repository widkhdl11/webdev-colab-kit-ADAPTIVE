import { describe, expect, it } from "vitest";
import { checkSignupName } from "./check-name";

// 미리 확인의 앱 서버 판정(signup INV-U14). 횟수 한도·존재 여부는 DB 함수 signup_name_check 가 한다(tests/integration/signup-nickname-db).
// 여기서 보는 것: 무엇을 DB 에 넘기고, 형식이 틀린 값은 DB 를 부르지 않고, 답을 어떤 꼴로 돌려주나.

const HASH = "a".repeat(64);

function harness(reply: { data: unknown; error: { code?: string } | null } = { data: "available", error: null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const deps = {
    admin: {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return reply;
      },
    },
  };
  return { deps, calls };
}

describe("INV-U14: 아이디·닉네임 미리 확인 — 앱 서버", () => {
  it("INV-U14: 아이디는 login_id, 닉네임은 nickname 으로 접속 주소 해시와 함께 넘기고, 답 하나만 돌려준다", async () => {
    const h = harness({ data: "taken", error: null });
    expect(await checkSignupName(h.deps, { kind: "loginId", value: " haru_creator " }, HASH)).toEqual({ status: 200, body: { result: "taken" } });
    expect(await checkSignupName(h.deps, { kind: "nickname", value: " 하루 " }, HASH)).toEqual({ status: 200, body: { result: "taken" } });
    expect(h.calls).toEqual([
      { fn: "signup_name_check", args: { p_ip_hash: HASH, p_kind: "login_id", p_value: "haru_creator" } },
      { fn: "signup_name_check", args: { p_ip_hash: HASH, p_kind: "nickname", p_value: "하루" } },
    ]);
  });

  it("INV-U14 (실패경로): 한도를 넘었다는 답은 429 rate_limited", async () => {
    const h = harness({ data: "rate_limited", error: null });
    expect(await checkSignupName(h.deps, { kind: "loginId", value: "haru_creator" }, HASH)).toEqual({ status: 429, body: { result: "rate_limited" } });
  });

  it("INV-U14: 형식이 틀린 값은 DB 를 부르지 않고 invalid", async () => {
    const h = harness();
    for (const body of [
      { kind: "loginId", value: "AB" },
      { kind: "loginId", value: "x".repeat(21) },
      { kind: "nickname", value: "가".repeat(13) },
      { kind: "nickname", value: "   " },
    ]) {
      expect(await checkSignupName(h.deps, body, HASH)).toEqual({ status: 200, body: { result: "invalid" } });
    }
    expect(h.calls).toEqual([]);
  });

  it("INV-U14 (실패경로): 모르는 종류·글자가 아닌 값·너무 긴 값은 400, DB 를 부르지 않는다", async () => {
    const h = harness();
    for (const body of [null, {}, { kind: "email", value: "a" }, { kind: "loginId", value: 1 }, { kind: "nickname", value: "가".repeat(201) }]) {
      expect((await checkSignupName(h.deps, body, HASH)).status).toBe(400);
    }
    expect(h.calls).toEqual([]);
  });

  it("INV-U14 (실패경로): DB 가 모르는 답을 주거나 오류면 던진다 — 「쓸 수 있다」로 넘어가지 않는다", async () => {
    await expect(checkSignupName(harness({ data: { id: "x" }, error: null }).deps, { kind: "loginId", value: "haru_creator" }, HASH)).rejects.toThrow();
    await expect(checkSignupName(harness({ data: null, error: { code: "42501" } }).deps, { kind: "loginId", value: "haru_creator" }, HASH)).rejects.toThrow();
  });
});
