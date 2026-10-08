import { passwordAttemptsOf } from "@/entities/session/api/password-attempts";
import type { CookieMethodsServer } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { signIn } from "@/features/auth/model/sign-in";
import { signOut } from "@/features/auth/model/sign-out";
import { createSessionClient } from "@/shared/api/supabase/session-cookies";
import { adminClient, SEED } from "./helpers";

// 로그인 스펙(docs/specs/session-login.md)을 실제 로컬 Supabase Auth 로 확인한다.
// 쿠키는 브라우저 대신 메모리 저장소가 들고 있다 — 앱의 라우트가 Next 쿠키 저장소를 넘기는 자리와 같은 자리다.

type Jar = Map<string, { value: string; options: Record<string, unknown> }>;

function memoryCookies(jar: Jar): CookieMethodsServer {
  return {
    getAll: () => [...jar].map(([name, c]) => ({ name, value: c.value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        if (value === "" || options?.maxAge === 0) jar.delete(name);
        else jar.set(name, { value, options: { ...options } });
      }
    },
  };
}

const config = () => ({ url: process.env.FK_TEST_API_URL ?? "", anonKey: process.env.FK_TEST_ANON_KEY ?? "" });
const dev = { NODE_ENV: "development" };

function client(jar: Jar) {
  return createSessionClient(config(), memoryCookies(jar), dev);
}

async function signedInJar(loginId: string): Promise<Jar> {
  const jar: Jar = new Map();
  const r = await signIn({ attempts: passwordAttemptsOf(adminClient()), auth: client(jar).auth, env: dev }, { loginId, password: "fankkuk-local-1234" });
  if (!r.ok) throw new Error(`로그인 실패: ${loginId}`);
  return jar;
}

describe("INV-L1: 로그인 토큰은 스크립트가 못 읽는 쿠키에만", () => {
  it("INV-L1 (S1): 로그인하면 세션 쿠키가 HttpOnly·SameSite=Lax 로 저장된다", async () => {
    const jar = await signedInJar("byeolbit_fan");
    expect(jar.size).toBeGreaterThan(0);
    for (const [, c] of jar) {
      expect(c.options.httpOnly).toBe(true);
      expect(c.options.sameSite).toBe("lax");
    }
  });
});

describe("INV-L2: 서버는 Supabase Auth 로 확인한 사용자만 쓴다", () => {
  it("INV-L2: 정상 쿠키면 그 계정의 ID 가 나온다", async () => {
    const jar = await signedInJar("byeolbit_fan");
    expect(await readVerifiedUserId(client(jar).auth)).toBe(SEED.fanId);
  });

  it("INV-L2 (S2): 쿠키 안의 토큰을 다른 사람 ID 로 고치면 로그인하지 않은 것으로 본다", async () => {
    const jar = await signedInJar("byeolbit_fan");
    const tampered: Jar = new Map();
    for (const [name, c] of jar) {
      // 쿠키 값(base64url JSON) 안의 access_token 본문에서 sub 를 달토끼로 바꾼다. 서명은 그대로다.
      const raw = c.value.startsWith("base64-") ? Buffer.from(c.value.slice(7), "base64url").toString("utf8") : c.value;
      const session = JSON.parse(raw) as { access_token: string; user?: { id: string } };
      const [h, p, s] = session.access_token.split(".");
      const payload = JSON.parse(Buffer.from(p!, "base64url").toString("utf8")) as { sub: string };
      payload.sub = SEED.otherFanId;
      session.access_token = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
      if (session.user) session.user.id = SEED.otherFanId;
      tampered.set(name, { value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`, options: c.options });
    }
    expect(await readVerifiedUserId(client(tampered).auth)).toBeNull();
  });

  it("INV-L2 (S2): 망가진 쿠키·쿠키 없음은 로그인하지 않은 것", async () => {
    const garbage: Jar = new Map([["sb-127-auth-token", { value: "base64-bm90LWpzb24", options: {} }]]);
    expect(await readVerifiedUserId(client(garbage).auth)).toBeNull();
    expect(await readVerifiedUserId(client(new Map()).auth)).toBeNull();
  });
});

describe("INV-L5: 실패 응답은 하나", () => {
  it("INV-L5 (S5): 실제 Auth 에서도 없는 아이디와 틀린 비밀번호의 응답이 같다", async () => {
    const wrongPw = await signIn({ attempts: passwordAttemptsOf(adminClient()), auth: client(new Map()).auth, env: dev }, { loginId: "byeolbit_fan", password: "wrong-password" });
    const noUser = await signIn({ attempts: passwordAttemptsOf(adminClient()), auth: client(new Map()).auth, env: dev }, { loginId: "nobody_here", password: "wrong-password" });
    expect(wrongPw.ok).toBe(false);
    expect(noUser).toEqual(wrongPw);
  });
});

describe("INV-L7: 로그아웃은 서버 세션까지 끝낸다", () => {
  it("INV-L7 (S7): 로그아웃 뒤 지운 쿠키 값을 다시 붙여도 로그인하지 않은 것", async () => {
    const jar = await signedInJar("daltokki_fan");
    const copied: Jar = new Map([...jar].map(([k, v]) => [k, { ...v }]));
    expect(await readVerifiedUserId(client(copied).auth)).toBe(SEED.otherFanId);

    await signOut(client(jar).auth);
    expect(jar.size).toBe(0);
    expect(await readVerifiedUserId(client(copied).auth)).toBeNull();
  });
});
