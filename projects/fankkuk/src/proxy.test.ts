// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";
import { fakeAuthFetch, UNIT_AUTH_COOKIE, UNIT_CONFIG, unitSessionCookieValue } from "@/shared/api/supabase/session-cookies-fake-auth";
import { proxy } from "./proxy";

// 요청마다 갱신(proxy)이 만료된 토큰을 새로 받아 로그인 쿠키를 다시 쓸 때의 옵션을 본다.
// 라이브러리는 진짜, Auth 서버만 가짜 fetch 다.

let fake: ReturnType<typeof fakeAuthFetch>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", UNIT_CONFIG.url);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", UNIT_CONFIG.anonKey);
  fake = fakeAuthFetch();
  vi.stubGlobal("fetch", fake.fetch);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function requestWith(cookies: Record<string, string>): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest("http://127.0.0.1:3000/me", { headers: { cookie } });
}

/** 응답의 Set-Cookie 중 로그인 쿠키 줄(값이 있는 것). */
function authSetCookies(res: Response): string[] {
  return res.headers.getSetCookie().filter((line) => line.startsWith(UNIT_AUTH_COOKIE) && !line.startsWith(`${UNIT_AUTH_COOKIE}=;`));
}

describe("INV-L15: 요청마다 갱신이 토큰을 다시 쓸 때도 표시를 따른다", () => {
  it("INV-L15 (S13b, 실패경로): 끄고 로그인한 표시가 있으면 갱신해 다시 쓴 로그인 쿠키에도 Max-Age·Expires 가 없다", async () => {
    const res = await proxy(requestWith({ [UNIT_AUTH_COOKIE]: unitSessionCookieValue(-60), [SESSION_ONLY_COOKIE]: "1" }));
    expect(fake.calls.some((u) => u.includes("grant_type=refresh_token"))).toBe(true);
    const lines = authSetCookies(res);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toMatch(/max-age/i);
      expect(line).not.toMatch(/expires/i);
      expect(line).toMatch(/httponly/i);
    }
  });

  it("INV-L15 (S13c): 표시가 없으면(켜고 로그인) 갱신한 로그인 쿠키에 만료 시각(Max-Age)이 붙는다", async () => {
    const res = await proxy(requestWith({ [UNIT_AUTH_COOKIE]: unitSessionCookieValue(-60) }));
    const lines = authSetCookies(res);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/max-age=34560000/i);
  });
});
