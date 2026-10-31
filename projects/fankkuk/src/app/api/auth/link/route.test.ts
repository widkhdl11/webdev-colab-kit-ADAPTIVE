// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LINK_LOGIN_FAILED_PATH, LINK_LOGIN_SIGNED_OUT_PATH, LINK_LOGIN_SUCCESS_PATH, newLoginLinkToken } from "@/entities/session/model/login-link";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";

// 토큰 쓰기 라우트의 겉 (docs/specs/link-login.md INV-K3·K4·K6).
// 같은 사이트 출처 확인·응답 하나·유지 켬. 토큰 쓰기·로그인 순서는 features/auth/model/link-sign-in 시험이 본다.

const decided: boolean[] = [];
const consumed: string[] = [];
const ACCOUNT = "00000000-0000-4000-a000-000000000012";
let accountFor: string | null = ACCOUNT;
/** 요청 쿠키로 이미 로그인해 있는 계정(카드 d1). null 이면 로그인 안 됨 */
let currentUser: string | null = null;
const authCalls: string[] = [];

vi.mock("@/shared/api/supabase/server", () => ({
  createDeferredRequestSupabase: async () => ({
    supabase: {
      auth: {
        getUser: async () => (currentUser ? { data: { user: { id: currentUser } }, error: null } : { data: { user: null }, error: { message: "none" } }),
        signOut: async (o: { scope?: string }) => {
          authCalls.push(`signOut:${o.scope}`);
          return { error: null };
        },
        verifyOtp: async () => {
          authCalls.push("verifyOtp");
          return { data: {}, error: null };
        },
      },
    },
    storedSessionOnly: true,
    decide: (sessionOnly: boolean) => {
      decided.push(sessionOnly);
    },
  }),
}));
vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => ({
    rpc: async (fn: string, args: { p_token_hash: string }) => {
      consumed.push(`${fn}:${args.p_token_hash}`);
      return { data: accountFor, error: null };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => ({ data: { user: { id, email: "momo_creator@login.fankkuk.invalid" } }, error: null }),
        generateLink: async () => ({ data: { properties: { hashed_token: "h" } }, error: null }),
      },
    },
  }),
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3000";
function post(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`${SITE}/api/auth/link`, {
    method: "POST",
    headers: { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
const markerLines = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`));

beforeEach(() => {
  decided.length = 0;
  consumed.length = 0;
  accountFor = ACCOUNT;
  currentUser = null;
  authCalls.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("INV-K3: 같은 사이트 화면이 보낸 JSON 만 토큰을 쓴다", () => {
  it("INV-K3 (S2b, 실패경로): 다른 사이트 출처면 403 이고 토큰을 쓰지 않는다", async () => {
    const res = await POST(post({ t: newLoginLinkToken().token }, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(consumed).toEqual([]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("INV-K3 (S2b, 실패경로): JSON 이 아닌 폼 전송이면 403", async () => {
    const res = await POST(post({ t: newLoginLinkToken().token }, { "content-type": "text/plain" }));
    expect(res.status).toBe(403);
    expect(consumed).toEqual([]);
  });

  it("INV-K3 (S2b, 실패경로): Origin 이 없으면 403", async () => {
    const req = new NextRequest(`${SITE}/api/auth/link`, {
      method: "POST",
      headers: { host: "127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({ t: newLoginLinkToken().token }),
    });
    expect((await POST(req)).status).toBe(403);
    expect(consumed).toEqual([]);
  });
});

describe("INV-K4: 성공이면 승인 대기 목록, 실패면 로그인 화면 — 응답은 하나씩", () => {
  it("INV-K4 · INV-L15 (S1): 성공하면 next 는 승인 대기 목록, 유지 켬(표시 쿠키를 지우고 켬으로 쓰기 규칙을 정한다), no-store", async () => {
    const res = await POST(post({ t: newLoginLinkToken().token }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: LINK_LOGIN_SUCCESS_PATH });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(decided).toEqual([false]);
    const lines = markerLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/max-age=0/i);
  });

  it("INV-K4 (S1b, 실패경로): 못 쓰면 next 는 로그인 화면이고, 표시 쿠키는 건드리지 않고 남은 표시대로 쓰기 규칙을 정한다", async () => {
    accountFor = null;
    const res = await POST(post({ t: newLoginLinkToken().token }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, next: LINK_LOGIN_FAILED_PATH });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(markerLines(res)).toEqual([]);
    expect(decided).toEqual([true]);
  });

  it("INV-K4 (실패경로): 토큰 없음·이미 씀은 같은 응답 — 상태가 화면으로 드러나지 않는다", async () => {
    const missing = await POST(post({}));
    accountFor = null;
    const used = await POST(post({ t: newLoginLinkToken().token }));
    expect(missing.status).toBe(used.status);
    expect(await missing.json()).toEqual(await used.json());
  });

  it("INV-K1 · S3 (실패경로): 주소 쿼리(?t=)로 온 토큰은 쓰지 않는다 — 본문의 t 만 본다", async () => {
    const { token } = newLoginLinkToken();
    const req = new NextRequest(`${SITE}/api/auth/link?t=${token}`, {
      method: "POST",
      headers: { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(await res.json()).toEqual({ ok: false, next: LINK_LOGIN_FAILED_PATH });
    expect(consumed).toEqual([]);
  });

  it("INV-K4 (카드 d1): 같은 계정으로 로그인해 있으면 그 로그인 그대로 승인 대기 목록 — 새로 로그인하지 않고 표시 쿠키도 건드리지 않는다", async () => {
    currentUser = ACCOUNT;
    const res = await POST(post({ t: newLoginLinkToken().token }));
    expect(await res.json()).toEqual({ ok: true, next: LINK_LOGIN_SUCCESS_PATH });
    expect(authCalls).toEqual([]);
    expect(markerLines(res)).toEqual([]);
    expect(decided).toEqual([true]);
  });

  it("INV-K4 (카드 d1, 실패경로): 다른 계정으로 로그인해 있으면 로그아웃하고 안내 없는 로그인 화면 — 링크 계정으로 로그인하지 않는다", async () => {
    currentUser = "00000000-0000-4000-a000-000000000001";
    const res = await POST(post({ t: newLoginLinkToken().token }));
    expect(await res.json()).toEqual({ ok: false, next: LINK_LOGIN_SIGNED_OUT_PATH });
    expect(new URL(LINK_LOGIN_SIGNED_OUT_PATH, "https://fankkuk.com").searchParams.get("link")).toBeNull();
    expect(authCalls).toEqual(["signOut:local"]);
    const lines = markerLines(res);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/max-age=0/i);
  });

  it("INV-K4 (카드 d1): 로그인해 있는데 토큰을 쓸 수 없으면 그 로그인 그대로 승인 대기 목록", async () => {
    currentUser = "00000000-0000-4000-a000-000000000001";
    accountFor = null;
    const res = await POST(post({ t: newLoginLinkToken().token }));
    expect(await res.json()).toEqual({ ok: true, next: LINK_LOGIN_SUCCESS_PATH });
    expect(authCalls).toEqual([]);
  });

  it("INV-K1 (S3): DB 에 넘기는 값은 해시 — 원문이 아니다", async () => {
    const { token, hash } = newLoginLinkToken();
    await POST(post({ t: token }));
    expect(consumed).toEqual([`login_link_consume:${hash}`]);
  });
});
