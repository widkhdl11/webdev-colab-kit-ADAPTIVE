// @vitest-environment node
import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, handleRequest, middleware } from "./middleware";
import type { SessionSource } from "@/entities/session/model/verified-user";
import type { MiddlewareSupabase } from "@/shared/api/supabase/middleware-client";

type Auth = NonNullable<MiddlewareSupabase["auth"]>;

const 위조된세션 = { data: { session: { user: { id: "위조로-만든-사용자" } } }, error: null };

// 검증하지 않는 경로는 어느 케이스에서도 부르지 않는다. 미들웨어 층에서도 같은 계약이다.
const getSession = vi.fn(async () => 위조된세션);
afterEach(() => {
  expect(getSession).not.toHaveBeenCalled();
  getSession.mockClear();
  vi.unstubAllEnvs();
});

// 실제 클라이언트의 auth 는 표면이 넓지만 가드가 부르는 것은 getClaims 하나뿐이다.
// satisfies 로 스텁의 반환 모양이 포트와 대조되게 둔다 — 캐스트는 넓히기에만 쓴다.
function authWith(sub: string | null): Auth {
  const source = {
    getClaims: async () =>
      sub === null ? { data: null, error: null } : { data: { claims: { sub } }, error: null },
    getSession,
  } satisfies SessionSource;
  return source as unknown as Auth;
}

function sourceOf(sub: string | null, refreshedCookie?: [string, string]) {
  return (request: NextRequest): MiddlewareSupabase => {
    const response = NextResponse.next({ request });
    if (refreshedCookie) response.cookies.set(refreshedCookie[0], refreshedCookie[1]);
    return { auth: authWith(sub), response: () => response };
  };
}

/** 환경변수가 없어 세션을 읽을 방법이 아예 없는 상태. */
const 설정없음 = (request: NextRequest): MiddlewareSupabase => ({
  auth: null,
  response: () => NextResponse.next({ request }),
});

const 요청 = (path: string, method = "GET") =>
  new NextRequest(`http://localhost:3100${path}`, { method });

const 목적지 = (response: NextResponse) => response.headers.get("location");

describe("handleRequest — 불변식의 강제 위치", () => {
  it("INV-A1: 세션이 없으면 보호된 경로를 로그인 페이지로 보낸다", async () => {
    const response = await handleRequest(요청("/studies/123"), sourceOf(null));

    expect(response.status).toBe(307);
    expect(목적지(response)).toBe("http://localhost:3100/login");
  });

  it("INV-A1(S1): 로그인 목적지는 같은 오리진이고 원래 쿼리를 달고 가지 않는다", async () => {
    const response = await handleRequest(
      요청("/studies/123?tab=members&token=비밀"),
      sourceOf(null),
    );

    expect(목적지(response)).toBe("http://localhost:3100/login");
  });

  it("INV-A1(반대 절반): 세션이 있으면 보호된 경로를 리다이렉트하지 않는다", async () => {
    const response = await handleRequest(요청("/studies/123"), sourceOf("진짜-사용자"));

    expect(response.status).toBe(200);
    expect(목적지(response)).toBeNull();
  });

  it("INV-A1(실패경로 S1b): 보호 목록에 없는 경로는 세션 없이도 통과시킨다", async () => {
    const response = await handleRequest(요청("/posts"), sourceOf(null));

    expect(목적지(response)).toBeNull();
  });

  it("INV-A2: 로그인 상태로 로그인 페이지에 오면 홈으로 보낸다", async () => {
    const response = await handleRequest(요청("/login"), sourceOf("진짜-사용자"));

    expect(response.status).toBe(307);
    expect(목적지(response)).toBe("http://localhost:3100/");
  });

  it("INV-A3: 리다이렉트할 때 갱신된 인증 쿠키를 함께 보낸다", async () => {
    const response = await handleRequest(
      요청("/studies/123"),
      sourceOf(null, ["sb-auth-token", "갱신된값"]),
    );

    expect(목적지(response)).not.toBeNull();
    expect(response.cookies.get("sb-auth-token")?.value).toBe("갱신된값");
  });

  it("INV-A3: 통과시킬 때도 갱신된 인증 쿠키를 그대로 실어 보낸다", async () => {
    const response = await handleRequest(
      요청("/posts"),
      sourceOf(null, ["sb-auth-token", "갱신된값"]),
    );

    expect(목적지(response)).toBeNull();
    expect(response.cookies.get("sb-auth-token")?.value).toBe("갱신된값");
  });

  it("INV-A1: GET 이 아닌 요청은 303 으로 보낸다 — 307 은 폼 본문을 로그인 경로로 재전송한다", async () => {
    const response = await handleRequest(요청("/studies/123", "POST"), sourceOf(null));

    expect(response.status).toBe(303);
  });
});

describe("세션을 읽을 설정이 없을 때 — 안전한 방향은 '비로그인'이다", () => {
  it("INV-A1: 설정이 없으면 전원을 비로그인으로 보고 보호 경로를 닫는다", async () => {
    const response = await handleRequest(요청("/studies/123"), 설정없음);

    expect(response.status).toBe(307);
    expect(목적지(response)).toBe("http://localhost:3100/login");
  });

  it("INV-A2(반대 절반): 설정이 없어도 로그인 페이지는 막지 않는다 — 전부 리다이렉트가 아니다", async () => {
    const response = await handleRequest(요청("/login"), 설정없음);

    expect(목적지(response)).toBeNull();
  });
});

describe("middleware — 프레임워크가 실제로 부르는 진입점", () => {
  it("INV-A1: 기본 배선으로도 같은 판정을 실행한다", async () => {
    // 환경변수를 비우면 네트워크에 붙지 않고 결정론적으로 돈다(설정 없음 → 비로그인).
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await middleware(요청("/studies/123"));

    expect(response.status).toBe(307);
    expect(목적지(response)).toBe("http://localhost:3100/login");
  });

  it("INV-A1(반대 절반): 기본 배선에서도 공개 경로는 통과시킨다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(목적지(await middleware(요청("/")))).toBeNull();
  });
});

describe("config.matcher — 미들웨어가 아예 안 도는 경로가 있으면 강제 위치가 무의미하다", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  // 경로를 리터럴로 둔다. 보호 목록이 바뀌면 이 목록도 같이 손대야 하는 편이,
  // 목록을 import 해 와서 조용히 따라가는 것보다 낫다.
  it.each([
    ["/studies/1.png"],
    ["/studies/123"],
    ["/posts/create.svg"],
    ["/profile/edit.webp"],
    ["/chats/42.jpeg"],
    ["/login"],
    ["/login.png"],
    ["/signup"],
    ["/"],
  ])("INV-A1 · INV-A2: %s 는 미들웨어를 탄다", (path) => {
    expect(matcher.test(path)).toBe(true);
  });

  it.each([["/_next/static/chunk.js"], ["/favicon.ico"], ["/robots.txt"]])(
    "정적 자산 %s 는 걸러 낸다(성능 필터로서의 역할)",
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});
