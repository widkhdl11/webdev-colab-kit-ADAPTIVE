// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";

// 로그아웃 라우트의 겉: 세션을 끝내고 표시 쿠키도 지우는지. 로그인 쿠키를 지우는 쓰기(만료 0)가 그대로 나가는지는
// session-cookies 시험(S13d)이 진짜 라이브러리로 본다.

let signOutCalls = 0;
vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => ({
    auth: {
      signOut: async () => {
        signOutCalls += 1;
        return { error: null };
      },
    },
  }),
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3000";

describe("INV-L15·INV-L7: 로그아웃하면 표시 쿠키도 지운다", () => {
  it("INV-L15·INV-L7 (S13d): 세션을 끝내고 표시 쿠키를 만료 0 으로 지운다", async () => {
    const req = new NextRequest(`${SITE}/api/auth/logout`, {
      method: "POST",
      headers: { origin: SITE, host: "127.0.0.1:3000", "content-type": "application/json", cookie: `${SESSION_ONLY_COOKIE}=1` },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(signOutCalls).toBe(1);
    const lines = res.headers.getSetCookie().filter((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(new RegExp(`^${SESSION_ONLY_COOKIE}=;`));
    expect(lines[0]).toMatch(/max-age=0/i);
  });
});
