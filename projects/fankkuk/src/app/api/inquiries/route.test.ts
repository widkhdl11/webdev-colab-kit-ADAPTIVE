// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 1:1 문의 남기기 라우트 (admin-console INV-K11, 결정 d25). 겉껍데기(같은 사이트 JSON·no-store)와
// 세션 클라이언트로 create_inquiry 를 부르는지를 본다. DB 는 가짜 클라이언트 — 세션 쿠키를 읽는 부분만 바꾼다.

const rpcCalls: { fn: string; args: unknown }[] = [];
let rpcError: { code: string } | null = null;
let throwOnSession = false;

vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => {
    if (throwOnSession) throw new Error("세션을 읽지 못했다");
    return {
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: rpcError ? null : "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f", error: rpcError };
      },
    };
  },
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3311";
const sameSiteJson = { origin: SITE, host: "127.0.0.1:3311", "content-type": "application/json" };
const OK = { kind: "shipping", title: "선물이 안 왔어요", body: "언제 가나요?", orderNo: "fc-7k3m9" };

function post(headers: Record<string, string>, body: string = JSON.stringify(OK)): NextRequest {
  return new NextRequest(`${SITE}/api/inquiries`, { method: "POST", headers, body });
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcError = null;
  throwOnSession = false;
});

describe("POST /api/inquiries (INV-K11, 결정 d25)", () => {
  it("같은 사이트 JSON 이면 다듬은 값으로 create_inquiry 를 부르고 200, 캐시하지 않는다", async () => {
    const res = await POST(post(sameSiteJson));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true });
    expect(rpcCalls).toEqual([
      { fn: "create_inquiry", args: { p_kind: "shipping", p_title: "선물이 안 왔어요", p_body: "언제 가나요?", p_order_no: "FC-7K3M9" } },
    ]);
  });

  it.each([
    ["다른 사이트", { ...sameSiteJson, origin: "https://evil.example.com" }],
    ["Origin 없음", { host: "127.0.0.1:3311", "content-type": "application/json" }],
    ["폼 인코딩", { ...sameSiteJson, "content-type": "application/x-www-form-urlencoded" }],
    ["글자 본문", { ...sameSiteJson, "content-type": "text/plain" }],
  ])("(실패경로): %s → 403, DB 를 부르지 않는다, no-store", async (_label, headers) => {
    const res = await POST(post(headers));
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rpcCalls).toEqual([]);
  });

  it.each([
    ["깨진 JSON", "{broken"],
    ["JSON 이 아닌 글", "분류=배송&제목=x"],
    ["빈 본문", ""],
    ["배열", "[]"],
  ])("(실패경로): %s 본문 → 400, DB 를 부르지 않는다, no-store", async (_label, body) => {
    const res = await POST(post(sameSiteJson, body));
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(rpcCalls).toEqual([]);
  });

  it("(실패경로): 로그인하지 않았으면(DB 42501) 401, no-store", async () => {
    rpcError = { code: "42501" };
    const res = await POST(post(sameSiteJson));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("(실패경로): 세션을 읽다 예외가 나도 500 이고 no-store", async () => {
    throwOnSession = true;
    const res = await POST(post(sameSiteJson));
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
