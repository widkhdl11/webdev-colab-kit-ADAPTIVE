import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SAME_AS_CURRENT_PHONE, VERIFY_AGAIN } from "@/features/phone-change/model/change-phone";
import { startPhoneVerification } from "@/features/signup/model/phone-verification";
import { choosePhoneVerifier } from "@/shared/api/phone-verifier/verifier";
import { accountPasswordDeps, canSignIn, createTestAccount, device, FIXTURE_PASSWORD, removeTestAccounts, testEmail, testPhone, type TestAccount } from "./account-fixtures";
import { adminClient, anonClient, psql } from "./helpers";

// 비밀번호 바꾸기(session-login INV-L12)·번호 바꾸기(signup INV-U12) 라우트를 실제로 부른다.
// 바꾸는 것은 세 자리뿐이다 — 요청 쿠키로 세션 클라이언트를 만드는 자리(시험 계정으로 로그인한 클라이언트를 넣는다),
// 관리자 키·일회용 Auth 클라이언트를 만드는 자리(로컬 Supabase), 그리고 쿠키 저장소(next/headers — 요청마다 비우는 메모리 상자).
// 같은 사이트 검사·캐시 금지·사람 확인·번호표 쿠키·한도·DB 함수는 실제 코드와 로컬 DB 가 한다.
// 번호 바꾸기 1단계는 지금 번호 비교 함수(manual 0013)를 먼저 부르므로, 「manual 0013 뒤」가 붙은 시험은 그 파일 적용 전에는 빨간불이 맞다.

type CookieWrite = { name: string; value: string; options: Record<string, unknown> | undefined };

const ctx = vi.hoisted(() => ({
  client: null as SupabaseClient | null,
  jar: new Map<string, string>(),
  writes: [] as CookieWrite[],
}));

vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => {
    if (!ctx.client) throw new Error("시험이 요청 클라이언트를 정하지 않았다");
    return ctx.client;
  },
}));
vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => adminClient() }));
vi.mock("@/shared/api/supabase/detached", () => ({ createDetachedAuth: () => accountPasswordDeps().makeDetachedAuth() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (ctx.jar.has(name) ? { name, value: ctx.jar.get(name) } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      ctx.writes.push({ name, value, options });
      if (options?.maxAge === 0) ctx.jar.delete(name);
      else ctx.jar.set(name, value);
    },
  }),
}));

const { POST: passwordPost } = await import("@/app/api/me/password/route");
const { POST: verifyPost } = await import("@/app/api/me/phone/verify/route");
const { POST: checkPost } = await import("@/app/api/me/phone/verify/check/route");
const { POST: phonePost } = await import("@/app/api/me/phone/route");

const SITE = "http://127.0.0.1:3311";
const COOKIE = "fk_phone_change_verification";

function post(path: string, body: unknown, origin = SITE): NextRequest {
  return new NextRequest(`${SITE}${path}`, {
    method: "POST",
    headers: { origin, host: "127.0.0.1:3311", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(handler: (req: NextRequest) => Promise<Response>, path: string, body: unknown, origin?: string) {
  const res = await handler(post(path, body, origin));
  return { status: res.status, cache: res.headers.get("cache-control"), body: (await res.json()) as Record<string, unknown> };
}

const phoneOf = (a: TestAccount) => psql(`select coalesce(phone, '') from pii.account_contacts where account_id = '${a.userId}'`);
const verificationsFor = (phone: string) => Number(psql(`select count(*) from pii.phone_verifications where phone = '${phone}'`));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeAll(removeTestAccounts);
afterAll(removeTestAccounts);
beforeEach(() => {
  ctx.client = null;
  ctx.jar.clear();
  ctx.writes.length = 0;
});

describe("INV-L12: /api/me/password — 같은 사이트 JSON 만, 캐시 금지, 사람은 세션에서만", () => {
  it("INV-L12 (실패경로): 다른 사이트(Origin)에서 온 요청은 403, 비밀번호 그대로, 응답 캐시 금지", async () => {
    const d = await createTestAccount({ tag: "rtorigin", email: testEmail("rtorigin") });
    ctx.client = await device(d.loginEmail);
    const r = await call(passwordPost, "/api/me/password", { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-rt-o1", newPasswordConfirm: "new-pass-rt-o1" }, "https://evil.example");
    expect(r.status).toBe(403);
    expect(r.cache).toBe("no-store");
    expect(await canSignIn(d.loginEmail, FIXTURE_PASSWORD)).toBe(true);
  });

  it("INV-L12 S10: 본문의 userId·accountId 는 무시하고 세션의 사람 비밀번호만 바꾼다 — 성공 응답도 캐시 금지", async () => {
    const d = await createTestAccount({ tag: "rtme", email: testEmail("rtme") });
    const other = await createTestAccount({ tag: "rtother", email: testEmail("rtother") });
    // 두 계정의 시험 비밀번호가 같으면 본문의 계정으로 바꿔 읽어도 「지금 비밀번호」 확인이 통과해 구별이 안 된다 — 다른 계정 것을 바꿔 둔다
    expect((await accountPasswordDeps().authAdmin.updateUserById(other.userId, { password: "other-pass-rt-9" })).error).toBeNull();
    ctx.client = await device(d.loginEmail);
    const r = await call(passwordPost, "/api/me/password", {
      userId: other.userId,
      accountId: other.userId,
      currentPassword: FIXTURE_PASSWORD,
      newPassword: "new-pass-rt-me1",
      newPasswordConfirm: "new-pass-rt-me1",
    });
    expect(r).toEqual({ status: 200, cache: "no-store", body: { ok: true } });
    expect(await canSignIn(d.loginEmail, "new-pass-rt-me1")).toBe(true);
    expect(await canSignIn(other.loginEmail, "other-pass-rt-9")).toBe(true);
    expect(await canSignIn(other.loginEmail, "new-pass-rt-me1")).toBe(false);
  });

  it("INV-L12 (실패경로): 로그인하지 않았으면 401, 실패 응답도 캐시 금지", async () => {
    ctx.client = anonClient();
    const r = await call(passwordPost, "/api/me/password", { currentPassword: FIXTURE_PASSWORD, newPassword: "new-pass-rt-a1", newPasswordConfirm: "new-pass-rt-a1" });
    expect(r.status).toBe(401);
    expect(r.cache).toBe("no-store");
  });
});

describe("INV-U12: /api/me/phone/* — 로그인 필수, 번호표는 스크립트가 못 읽는 쿠키로만", () => {
  it("INV-U12 (실패경로): 로그인하지 않았으면 세 라우트 모두 401 — 본인 확인 요청도 쿠키도 생기지 않는다", async () => {
    ctx.client = anonClient();
    const next = testPhone();
    for (const [handler, path, body] of [
      [verifyPost, "/api/me/phone/verify", { phone: next }],
      [checkPost, "/api/me/phone/verify/check", {}],
      [phonePost, "/api/me/phone", { phone: next, currentPassword: FIXTURE_PASSWORD }],
    ] as const) {
      const r = await call(handler, path, body);
      expect(r.status).toBe(401);
      expect(r.cache).toBe("no-store");
    }
    expect(verificationsFor(next)).toBe(0);
    expect(ctx.writes).toEqual([]);
  });

  it("INV-U12 (manual 0013 뒤): 본인 확인 요청 — 번호표는 응답 본문에 없고 HttpOnly 쿠키(이 경로 아래에만)로만 간다", async () => {
    const f = await createTestAccount({ tag: "rtverify", email: testEmail("rtverify"), phone: testPhone() });
    ctx.client = await device(f.loginEmail);
    const next = testPhone();
    const r = await call(verifyPost, "/api/me/phone/verify", { phone: next });
    expect(r).toEqual({ status: 200, cache: "no-store", body: { requested: true } });
    expect(ctx.writes).toHaveLength(1);
    const [w] = ctx.writes;
    expect(w!.name).toBe(COOKIE);
    expect(w!.value).toMatch(UUID);
    expect(w!.options).toMatchObject({ httpOnly: true, path: "/api/me/phone", sameSite: "lax", maxAge: 1200 });
    expect(psql(`select phone from pii.phone_verifications where id = '${w!.value}'`)).toBe(next);
  });

  it("INV-U12 (실패경로, manual 0013 뒤): 지금 번호와 같은 번호면 카카오 요청 전에 400 — 본인 확인 줄도 쿠키도 생기지 않는다", async () => {
    const mine = testPhone();
    const f = await createTestAccount({ tag: "rtsame", email: testEmail("rtsame"), phone: mine });
    ctx.client = await device(f.loginEmail);
    const r = await call(verifyPost, "/api/me/phone/verify", { phone: mine.replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3") });
    expect(r).toEqual({ status: 400, cache: "no-store", body: { field: "phone", message: SAME_AS_CURRENT_PHONE } });
    expect(verificationsFor(mine)).toBe(0);
    expect(ctx.writes).toEqual([]);
  });

  it("INV-U10·U12 (실패경로, manual 0013 뒤): 한 번호로 한 시간에 다섯 번까지 — 여섯 번째는 429", async () => {
    const f = await createTestAccount({ tag: "rtlimit", email: testEmail("rtlimit"), phone: testPhone() });
    ctx.client = await device(f.loginEmail);
    const next = testPhone();
    for (let i = 0; i < 5; i += 1) expect((await call(verifyPost, "/api/me/phone/verify", { phone: next })).status).toBe(200);
    const sixth = await call(verifyPost, "/api/me/phone/verify", { phone: next });
    expect(sixth.status).toBe(429);
    expect(verificationsFor(next)).toBe(5);
  });

  it("INV-U12 (실패경로): 확인 묻기는 본문의 번호표를 읽지 않는다 — 쿠키가 없으면 다시 하라는 응답, 그 번호표는 확인되지 않은 채", async () => {
    const f = await createTestAccount({ tag: "rtcheck", email: testEmail("rtcheck"), phone: testPhone() });
    ctx.client = await device(f.loginEmail);
    const started = await startPhoneVerification({ admin: adminClient(), verifier: choosePhoneVerifier({ NODE_ENV: "development" }) }, { phone: testPhone() });
    if (!started.ok) throw new Error("본인 확인 요청 실패");
    const verifiedAt = () => psql(`select coalesce(verified_at::text, '') from pii.phone_verifications where id = '${started.verificationId}'`);

    const viaBody = await call(checkPost, "/api/me/phone/verify/check", { verificationId: started.verificationId });
    expect(viaBody.status).toBe(400);
    expect(verifiedAt()).toBe("");

    ctx.jar.set(COOKIE, started.verificationId);
    const viaCookie = await call(checkPost, "/api/me/phone/verify/check", {});
    expect(viaCookie).toEqual({ status: 200, cache: "no-store", body: { status: "verified" } });
    expect(verifiedAt()).not.toBe("");
  });

  it("INV-U12 (실패경로): 번호 바꾸기는 본문의 번호표를 읽지 않는다 — 확인된 번호표를 본문에 넣어도 쿠키가 없으면 거부, 번호 그대로", async () => {
    const before = testPhone();
    const f = await createTestAccount({ tag: "rtbody", email: testEmail("rtbody"), phone: before });
    ctx.client = await device(f.loginEmail);
    const next = testPhone();
    const deps = { admin: adminClient(), verifier: choosePhoneVerifier({ NODE_ENV: "development" }) };
    const started = await startPhoneVerification(deps, { phone: next });
    if (!started.ok) throw new Error("본인 확인 요청 실패");
    ctx.jar.set(COOKIE, started.verificationId);
    expect((await call(checkPost, "/api/me/phone/verify/check", {})).body).toEqual({ status: "verified" });
    ctx.jar.clear();

    const r = await call(phonePost, "/api/me/phone", { phone: next, currentPassword: FIXTURE_PASSWORD, verificationId: started.verificationId });
    expect(r).toEqual({ status: 400, cache: "no-store", body: { field: "verification", message: VERIFY_AGAIN } });
    expect(phoneOf(f)).toBe(before);
  });

  it("INV-U12 S12 (manual 0013 뒤): 세 라우트를 차례로 — 요청 → 확인 → 바꾸기, 번호가 바뀌고 번호표 쿠키는 지워진다. 본문의 계정은 무시된다", async () => {
    const f = await createTestAccount({ tag: "rtflow", email: testEmail("rtflow"), phone: testPhone() });
    const otherPhone = testPhone();
    const other = await createTestAccount({ tag: "rtflowo", email: testEmail("rtflowo"), phone: otherPhone });
    ctx.client = await device(f.loginEmail);
    const next = testPhone();
    expect((await call(verifyPost, "/api/me/phone/verify", { phone: next })).status).toBe(200);
    expect((await call(checkPost, "/api/me/phone/verify/check", {})).body).toEqual({ status: "verified" });
    const r = await call(phonePost, "/api/me/phone", { phone: next, currentPassword: FIXTURE_PASSWORD, accountId: other.userId, userId: other.userId });
    expect(r).toEqual({ status: 200, cache: "no-store", body: { ok: true } });
    expect(phoneOf(f)).toBe(next);
    expect(phoneOf(other)).toBe(otherPhone);
    expect(ctx.jar.has(COOKIE)).toBe(false);
    expect(ctx.writes.at(-1)).toMatchObject({ name: COOKIE, value: "", options: { maxAge: 0, path: "/api/me/phone" } });
  });
});
