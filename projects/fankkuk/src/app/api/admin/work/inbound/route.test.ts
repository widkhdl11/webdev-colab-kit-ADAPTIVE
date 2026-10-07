// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addressCodeCheckChar } from "@/entities/parcel/model/address-code";
import { spyConsole, type ConsoleSpy } from "@/shared/lib/testing/console-spy";

// 입고 라우트 (inbound-address-code INV-C2): 직원이 넣은 6자리는 서버 로그(console)에 남지 않는다.
// DB 는 가짜 클라이언트 — 세션 쿠키를 읽는 부분만 바꾼다. console 을 엿보며 실제로 라우트를 부른다.

const CODE = "K7M3X" + addressCodeCheckChar("K7M3X");
type Mode = "throw" | "db_error" | "odd_result";
let mode: Mode = "throw";

vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => ({
    rpc: async (fn: string) => {
      if (fn === "is_operator") return { data: true, error: null };
      if (fn === "is_owner") return { data: false, error: null };
      if (fn === "office_log_code_input") throw new Error(`측정 기록 실패 ${CODE}`);
      if (fn === "office_scan_inbound") {
        // 실패 메시지·예외·모르는 답 어디에 6자리가 섞여 와도 로그로 나가면 안 된다
        if (mode === "throw") throw new Error(`연결 끊김 p_code=${CODE}`);
        if (mode === "db_error") return { data: null, error: { code: "XX000", message: `오류 ${CODE}`, details: CODE } };
        return { data: { result: "weird", code: CODE }, error: null };
      }
      return { data: null, error: { code: "XX000" } };
    },
  }),
}));

const { POST } = await import("./route");

const SITE = "http://127.0.0.1:3311";
const headers = { origin: SITE, host: "127.0.0.1:3311", "content-type": "application/json" };

function post(body: unknown): NextRequest {
  return new NextRequest(`${SITE}/api/admin/work/inbound`, { method: "POST", headers, body: JSON.stringify(body) });
}

let spy: ConsoleSpy;
beforeEach(() => {
  spy = spyConsole();
});
afterEach(() => spy.restore());

describe("POST /api/admin/work/inbound — 6자리는 로그에 남지 않는다 (inbound-address-code INV-C2)", () => {
  it("INV-C2 (실패경로): 처리 중 예외에 6자리가 섞여 있어도 오류 로그는 남기되 6자리는 남기지 않는다", async () => {
    mode = "throw";
    const res = await POST(post({ kind: "inbound", barcode: "123456789012", code: CODE }));
    expect(res.status).toBe(500);
    // 로그 길이 실제로 돌았다(아무것도 안 찍어서 통과한 것이 아니다)
    expect(spy.calls.length).toBeGreaterThan(0);
    expect(spy.leaked(CODE)).toBe(false);
  });

  it("INV-C2 (실패경로): DB 오류·모르는 답에 6자리가 들어 와도 응답과 로그 어디에도 6자리가 없다", async () => {
    for (const m of ["db_error", "odd_result"] as const) {
      mode = m;
      const res = await POST(post({ kind: "inbound", barcode: "123456789012", code: CODE.toLowerCase() }));
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain(CODE);
    }
    expect(spy.leaked(CODE)).toBe(false);
  });
});
