import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { anonClient, signedInClient } from "./helpers";

// 관리자 주소에 들어온 사람 판정 (admin-console INV-K1 S1c). 레이아웃·화면이 부르는 loadAdminSession 을 그대로 부른다.
// 바꾸는 것은 요청 쿠키로 세션 클라이언트를 만드는 자리 하나뿐이다 — 쿠키 대신 시험 계정으로 로그인한 클라이언트를 넣는다.
// 그 뒤의 판정(readViewer → DB 판정 함수 is_operator·is_owner → notFound)은 로컬 DB 에 실제로 묻는다.

const request = vi.hoisted(() => ({ client: null as SupabaseClient | null }));

vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => {
    if (!request.client) throw new Error("시험이 요청 클라이언트를 정하지 않았다");
    return request.client;
  },
}));

const { loadAdminSession } = await import("@/widgets/admin-shell/api/admin-session");

/** Next 의 notFound() 가 던지는 404 신호인가. */
function isNotFound(e: unknown): boolean {
  return typeof (e as { digest?: unknown })?.digest === "string" && /;404$/.test((e as { digest: string }).digest);
}

describe("관리자 주소는 운영자가 아니면 404 (INV-K1 S1c)", () => {
  it.each(["byeolbit_fan", "haru_creator"])("INV-K1 S1c (실패경로): %s 로 관리자 주소에 들어오면 404", async (loginId) => {
    request.client = await signedInClient(loginId);
    await expect(loadAdminSession()).rejects.toSatisfy(isNotFound);
  });

  it("INV-K1 S1c (실패경로): 로그인하지 않은 손님도 404", async () => {
    request.client = anonClient();
    await expect(loadAdminSession()).rejects.toSatisfy(isNotFound);
  });

  it("INV-K1·K2: 직원 운영자는 들어오고 읽기만(staff), 대표는 owner", async () => {
    request.client = await signedInClient("fankkuk_staff");
    expect((await loadAdminSession()).access).toBe("staff");
    request.client = await signedInClient("fankkuk_admin");
    expect((await loadAdminSession()).access).toBe("owner");
  });
});
