import { describe, expect, it } from "vitest";
import { passwordAttemptsOf } from "./password-attempts";

function fakeAdmin(reply: { data: unknown; error: { code: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const admin = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return reply;
    },
  } as never;
  return { calls, admin };
}

describe("비밀번호 확인 횟수 어댑터 (session-login INV-L14)", () => {
  it("INV-L14: 시작은 아이디를 소문자로 맞춰 넘기고, DB 의 시도 번호를 그대로 돌려준다", async () => {
    const { calls, admin } = fakeAdmin({ data: 42, error: null });
    expect(await passwordAttemptsOf(admin).begin(" ByeolBit_Fan ")).toBe(42);
    expect(calls).toEqual([{ fn: "password_attempt_begin", args: { p_login_key: "byeolbit_fan" } }]);
  });

  it("INV-L14 (S12): DB 가 null(막힘)이면 null — 0 이나 다른 값으로 바꾸지 않는다", async () => {
    expect(await passwordAttemptsOf(fakeAdmin({ data: null, error: null }).admin).begin("byeolbit_fan")).toBeNull();
  });

  it("INV-L14 (실패경로): DB 오류·꼴이 다른 답은 던진다 — 막힘을 확인하지 못한 채 비밀번호를 묻지 않게", async () => {
    await expect(passwordAttemptsOf(fakeAdmin({ data: null, error: { code: "XX000" } }).admin).begin("a")).rejects.toThrow();
    await expect(passwordAttemptsOf(fakeAdmin({ data: "42", error: null }).admin).begin("a")).rejects.toThrow();
    await expect(passwordAttemptsOf(fakeAdmin({ data: null, error: { code: "XX000" } }).admin).finish(1, true)).rejects.toThrow();
    await expect(passwordAttemptsOf(fakeAdmin({ data: null, error: { code: "XX000" } }).admin).clear("a")).rejects.toThrow();
  });

  it("INV-L14: 결과·풀기는 그 DB 함수를 부른다", async () => {
    const done = fakeAdmin({ data: null, error: null });
    await passwordAttemptsOf(done.admin).finish(7, false);
    await passwordAttemptsOf(done.admin).clear("ByeolBit_Fan");
    expect(done.calls).toEqual([
      { fn: "password_attempt_finish", args: { p_id: 7, p_ok: false } },
      { fn: "password_attempt_clear", args: { p_login_key: "byeolbit_fan" } },
    ]);
  });
});
