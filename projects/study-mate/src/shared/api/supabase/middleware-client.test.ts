// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCookieBridge, createMiddlewareSupabase } from "./middleware-client";

const 요청 = () => new NextRequest("http://localhost:3100/studies/123");

// Supabase 가 setAll 두 번째 인자로 넘기는 헤더. 인증 쿠키가 실린 응답이 CDN 에
// 캐시되면 한 사용자의 세션이 다른 사용자에게 나간다.
const 캐시금지헤더 = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("createCookieBridge — 세션 갱신이 실제로 일어나는 자리", () => {
  it("갱신된 쿠키를 응답에 싣는다", () => {
    const bridge = createCookieBridge(요청());

    bridge.cookies.setAll?.(
      [{ name: "sb-auth-token", value: "갱신된값", options: { path: "/", httpOnly: true } }],
      캐시금지헤더,
    );

    const cookie = bridge.response().cookies.get("sb-auth-token");
    expect(cookie?.value).toBe("갱신된값");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("response() 는 호출 시점의 응답을 준다 — 갱신 전에 잡아 둔 응답에는 갱신분이 없다", () => {
    const bridge = createCookieBridge(요청());
    const 갱신전 = bridge.response();

    bridge.cookies.setAll?.([{ name: "sb-auth-token", value: "갱신된값", options: {} }], 캐시금지헤더);

    // 갱신 뒤에 읽어야 새 응답이 나온다. response 를 미리 값으로 붙들면 갱신분을 잃는다.
    expect(갱신전.cookies.get("sb-auth-token")).toBeUndefined();
    expect(bridge.response().cookies.get("sb-auth-token")?.value).toBe("갱신된값");
  });

  it("갱신된 쿠키는 요청 쪽에도 반영된다 — 다음 핸들러가 옛 값을 보지 않게", () => {
    const request = 요청();
    const bridge = createCookieBridge(request);

    bridge.cookies.setAll?.([{ name: "sb-auth-token", value: "갱신된값", options: {} }], 캐시금지헤더);

    expect(request.cookies.get("sb-auth-token")?.value).toBe("갱신된값");
    expect(bridge.cookies.getAll()).toContainEqual(
      expect.objectContaining({ name: "sb-auth-token", value: "갱신된값" }),
    );
  });

  it("삭제 쿠키(빈 값 + maxAge 0)도 그대로 실린다 — 로그아웃이 이 경로를 탄다", () => {
    const bridge = createCookieBridge(요청());

    bridge.cookies.setAll?.([{ name: "sb-auth-token", value: "", options: { maxAge: 0 } }], 캐시금지헤더);

    const cookie = bridge.response().cookies.get("sb-auth-token");
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});

describe("createMiddlewareSupabase — 설정 유무", () => {
  it("설정이 있으면 세션을 읽을 수 있는 클라이언트를 준다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_테스트값");

    expect(createMiddlewareSupabase(요청()).auth).not.toBeNull();
  });

  it("설정이 없으면 auth 가 null 이다 — 부르는 쪽이 '비로그인'으로 판정할 근거", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(createMiddlewareSupabase(요청()).auth).toBeNull();
  });

  it("키 하나만 비어도 null 이다", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

    expect(createMiddlewareSupabase(요청()).auth).toBeNull();
  });

  it("설정이 없다는 사실을 어느 변수가 비었는지와 함께 한 번만 남긴다", async () => {
    // '한 번만'은 모듈 수준 플래그라, 앞선 케이스가 이미 찍었는지에 좌우되지 않게
    // 모듈을 새로 불러와 깨끗한 상태에서 센다.
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_테스트값");
    const 새모듈 = await import("./middleware-client");

    새모듈.createMiddlewareSupabase(요청());
    새모듈.createMiddlewareSupabase(요청());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });
});

describe("createCookieBridge — 캐시 금지 헤더", () => {
  it("인증 쿠키를 실을 때 받은 헤더를 응답에 그대로 옮긴다", () => {
    const bridge = createCookieBridge(요청());

    bridge.cookies.setAll?.(
      [{ name: "sb-auth-token", value: "갱신된값", options: {} }],
      캐시금지헤더,
    );

    const response = bridge.response();
    expect(response.headers.get("Cache-Control")).toBe(캐시금지헤더["Cache-Control"]);
    expect(response.headers.get("Expires")).toBe("0");
  });
});
