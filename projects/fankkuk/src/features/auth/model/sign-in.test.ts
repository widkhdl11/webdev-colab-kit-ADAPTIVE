import { describe, expect, it } from "vitest";
import { SIGN_IN_FAILED_MESSAGE, signIn, type PasswordAuth } from "./sign-in";

// 비밀번호 확인 자체는 Supabase Auth 가 한다. 여기서 보는 것은 그 앞뒤의 판정 — 무엇을 넘기고, 실패를 어떻게 돌려주나.
function recordingAuth(result: "ok" | "invalid_credentials" | "user_not_found") {
  const calls: { email: string; password: string }[] = [];
  const auth: PasswordAuth = {
    async signInWithPassword(c) {
      calls.push(c);
      return result === "ok" ? { error: null } : { error: { code: result, message: "Invalid login credentials" } };
    },
  };
  return { auth, calls };
}

const dev = { NODE_ENV: "development" };

describe("아이디 로그인", () => {
  it("아이디를 정해진 주소로 바꿔 Supabase Auth 에 넘긴다", async () => {
    const { auth, calls } = recordingAuth("ok");
    const r = await signIn({ auth, env: dev }, { loginId: "byeolbit_fan", password: "pw-1234" });
    expect(r).toEqual({ ok: true });
    expect(calls).toEqual([{ email: "byeolbit_fan@fankkuk.test", password: "pw-1234" }]);
  });

  it("빈 칸이면 Auth 를 부르지 않고 입력 안내를 돌려준다", async () => {
    const { auth, calls } = recordingAuth("ok");
    const r = await signIn({ auth, env: dev }, { loginId: "", password: "" });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(calls).toEqual([]);
    expect((await signIn({ auth, env: dev }, "not an object")).ok).toBe(false);
  });
});

describe("INV-L5: 실패 응답은 아이디 없음과 비밀번호 틀림을 구분하지 않는다", () => {
  it("INV-L5 (S5): 없는 아이디·틀린 비밀번호·꼴이 다른 아이디가 모두 같은 응답이다", async () => {
    const wrongPw = await signIn({ auth: recordingAuth("invalid_credentials").auth, env: dev }, { loginId: "byeolbit_fan", password: "x" });
    const noUser = await signIn({ auth: recordingAuth("user_not_found").auth, env: dev }, { loginId: "nobody_here", password: "x" });
    const badShape = await signIn({ auth: recordingAuth("ok").auth, env: dev }, { loginId: "Nobody Here!", password: "x" });
    expect(wrongPw).toEqual({ ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE });
    expect(noUser).toEqual(wrongPw);
    expect(badShape).toEqual(wrongPw);
  });
});

describe("INV-L6: 시험 계정은 운영 환경에서 로그인할 수 없다", () => {
  it("INV-L6 (S6): 운영 표시가 있으면 시험 계정은 Auth 를 부르지 않고 같은 실패 응답", async () => {
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development", VERCEL_ENV: "production" }]) {
      const { auth, calls } = recordingAuth("ok");
      const r = await signIn({ auth, env }, { loginId: "byeolbit_fan", password: "pw-1234" });
      expect(r).toEqual({ ok: false, status: 401, message: SIGN_IN_FAILED_MESSAGE });
      expect(calls).toEqual([]);
    }
  });

  it("INV-L6: 개발 환경에서는 시험 계정이 들어간다", async () => {
    const { auth, calls } = recordingAuth("ok");
    expect(await signIn({ auth, env: dev }, { loginId: "byeolbit_fan", password: "pw" })).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
  });
});
