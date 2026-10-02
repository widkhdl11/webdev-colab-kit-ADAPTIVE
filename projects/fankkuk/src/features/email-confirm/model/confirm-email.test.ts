import { describe, expect, it } from "vitest";
import { confirmEmail } from "./confirm-email";

const FAN = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;
const TOKEN = "0123456789abcdef".repeat(4);

function fakeClient(reply: { data: unknown; error: { code: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return reply;
      },
    } as never,
  };
}

describe("이메일 링크 확인", () => {
  it("INV-A7 S7b: 링크 값만 DB 에 넘기고, 확인된 주소를 돌려준다", async () => {
    const f = fakeClient({ data: "b@example.com", error: null });
    expect(await confirmEmail({ client: f.client, viewer: FAN }, { token: TOKEN, userId: "other" })).toEqual({ ok: true, email: "b@example.com" });
    expect(f.calls).toEqual([{ fn: "confirm_my_email", args: { p_token: TOKEN } }]);
  });

  it("INV-A7 S7c: DB 가 거부한 링크는 400, 이유는 하나로 묶는다", async () => {
    const f = fakeClient({ data: null, error: { code: "P0002" } });
    expect(await confirmEmail({ client: f.client, viewer: FAN }, { token: TOKEN })).toMatchObject({ ok: false, status: 400 });
  });

  it.each([["짧은 값", "abc"], ["대문자", TOKEN.toUpperCase()], ["숫자", 123], ["없음", undefined]])(
    "INV-A7 S7c: 꼴이 틀린 링크 값(%s)은 DB 를 부르지 않고 400",
    async (_label, token) => {
      const f = fakeClient({ data: "x", error: null });
      expect(await confirmEmail({ client: f.client, viewer: FAN }, { token })).toMatchObject({ ok: false, status: 400 });
      expect(f.calls).toEqual([]);
    },
  );

  it("INV-A3 S3c: 로그인하지 않았으면 401, DB 를 부르지 않는다", async () => {
    const f = fakeClient({ data: "x", error: null });
    expect(await confirmEmail({ client: f.client, viewer: null }, { token: TOKEN })).toMatchObject({ ok: false, status: 401 });
    expect(f.calls).toEqual([]);
  });
});
