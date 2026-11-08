// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// 옛 역조공 보내기 등록 (revgift-box INV-GB22 S22) — 크리에이터 로그인이어도 새 등록은 거부되고, DB 등록 함수는 불리지 않는다.

const calls: string[] = [];
vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => ({ rpc: async (fn: string) => (calls.push(fn), { data: null, error: null }) }),
}));
vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => ({ rpc: async (fn: string) => (calls.push(`admin:${fn}`), { data: null, error: null }) }),
}));

const { POST } = await import("./route");
const { REVGIFT_SEND_CLOSED_MESSAGE } = await import("@/features/revgift-send/model/register-revgift");

const SITE = "http://127.0.0.1:3311";
const headers = { origin: SITE, host: "127.0.0.1:3311", "content-type": "application/json" };

describe("INV-GB22: 옛 보내기 등록 API", () => {
  it("INV-GB22 S22 (실패경로): 하루가 옛 보내기 등록 API 를 부름 — 410, 선물함으로 안내, DB 등록 함수를 부르지 않는다", async () => {
    const body = { shares: [{ fanId: "00000000-0000-4000-a000-000000000001", tier: "small" }], quotedTotalKrw: 5400 };
    const res = await POST(new NextRequest(`${SITE}/api/revgifts`, { method: "POST", headers, body: JSON.stringify(body) }));
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ message: REVGIFT_SEND_CLOSED_MESSAGE, next: "/creator/revgift-boxes/new" });
    expect(calls).not.toContain("admin:register_revgift");
    expect(calls).toEqual([]);
  });
});
