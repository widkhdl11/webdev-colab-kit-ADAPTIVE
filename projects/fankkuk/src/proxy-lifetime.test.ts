// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_HINT_COOKIE, LOGIN_HINT_HEADER, LOGIN_HINT_LINK } from "@/entities/session/model/session-end-notice";
import { SESSION_LIFETIMES, sessionCookieMaxAgeSeconds } from "@/entities/session/model/session-lifetime";
import { SESSION_ONLY_COOKIE } from "@/shared/api/supabase/session-cookies";
import { fakeAuthFetch, UNIT_AUTH_COOKIE, UNIT_CONFIG, UNIT_SESSION_ID, UNIT_USER, unitSessionCookieValue } from "@/shared/api/supabase/session-cookies-fake-auth";

// 요청마다 갱신(proxy)이 역할별 로그인 유지 기간을 판정한다 (docs/specs/session-login.md INV-L16·L17).
// 라이브러리·Auth 응답 꼴은 진짜(가짜 fetch), DB 함수만 가짜다 — 판정 재료(역할·로그인 시각·마지막 사용)를 시험마다 정한다.

vi.mock("server-only", () => ({}));

type Facts = { role: string; is_owner: boolean; created_at: string; last_seen_at: string | null; db_now: string } | null;
let facts: Facts = null;
let factsError = false;
let linkReady = false;
const rpcCalls: { fn: string; args: unknown }[] = [];

vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => ({
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      if (fn === "session_lifetime_facts") return factsError ? { data: null, error: { code: "57014" } } : { data: facts ? [facts] : [], error: null };
      if (fn === "session_touch") return { data: true, error: null };
      if (fn === "session_end") return { data: null, error: null };
      if (fn === "login_link_template_ready") return { data: linkReady, error: null };
      throw new Error(`모르는 함수 ${fn}`);
    },
  }),
}));

const { proxy } = await import("./proxy");

const MIN = 60_000;
const NOW = Date.parse("2026-10-31T12:00:00.000Z");
let fake: ReturnType<typeof fakeAuthFetch>;

/** 그 갈래·로그인한 지·마지막 사용한 지(밀리초)의 판정 재료 */
function setFacts(role: "fan" | "creator" | "operator", loginAgo: number, lastSeenAgo: number | null, isOwner = false) {
  facts = {
    role,
    is_owner: isOwner,
    created_at: new Date(NOW - loginAgo).toISOString(),
    last_seen_at: lastSeenAgo === null ? null : new Date(NOW - lastSeenAgo).toISOString(),
    db_now: new Date(NOW).toISOString(),
  };
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", UNIT_CONFIG.url);
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", UNIT_CONFIG.anonKey);
  fake = fakeAuthFetch();
  vi.stubGlobal("fetch", fake.fetch);
  facts = null;
  factsError = false;
  linkReady = false;
  rpcCalls.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function requestTo(path: string, cookies: Record<string, string>): NextRequest {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`http://127.0.0.1:3000${path}`, { headers: { cookie } });
}
const live = () => ({ [UNIT_AUTH_COOKIE]: unitSessionCookieValue(3600) });
const expiring = () => ({ [UNIT_AUTH_COOKIE]: unitSessionCookieValue(-60) });
const authLines = (res: Response) => res.headers.getSetCookie().filter((l) => l.startsWith(UNIT_AUTH_COOKIE));
const fns = () => rpcCalls.map((c) => c.fn);
const hintLine = (res: Response) => res.headers.getSetCookie().find((l) => l.startsWith(`${LOGIN_HINT_COOKIE}=`));

describe("INV-L16: 기간 안이면 그대로, 1분이 지났을 때만 마지막 사용 시각을 고친다", () => {
  it("INV-L16 (S14): 팬이 6일 23시간 미사용이면 그대로 지나가고 마지막 사용 시각을 고친다 — 판정 재료는 그 사람·그 세션으로 묻는다", async () => {
    setFacts("fan", 10 * 24 * 60 * MIN, SESSION_LIFETIMES.member.idleMs - 60 * MIN);
    const res = await proxy(requestTo("/me", live()));
    expect(res.headers.get("location")).toBeNull();
    expect(fns()).toEqual(["session_lifetime_facts", "session_touch"]);
    expect(rpcCalls[0]!.args).toEqual({ p_user_id: UNIT_USER.id, p_session_id: UNIT_SESSION_ID });
  });

  it("INV-L16: 마지막 사용이 1분 안이면 고치지 않는다", async () => {
    setFacts("fan", 60 * MIN, 10_000);
    await proxy(requestTo("/me", live()));
    expect(fns()).toEqual(["session_lifetime_facts"]);
  });

  it("INV-L19: 남은 시간 확인 요청은 사용으로 치지 않는다(마지막 사용 시각을 고치지 않는다)", async () => {
    setFacts("operator", 60 * MIN, 5 * MIN);
    await proxy(requestTo("/api/auth/session/status", live()));
    expect(fns()).toEqual(["session_lifetime_facts"]);
  });

  it("INV-L16: 로그인하지 않은 요청은 DB 에 묻지 않는다", async () => {
    await proxy(requestTo("/me", {}));
    expect(fns()).toEqual([]);
  });
});

describe("INV-L16 (실패경로): 기간을 넘으면 세션을 서버에서 끝내고 로그인 화면으로", () => {
  it("INV-L16 · INV-L17 (S14·S15b): 팬 미사용 7일 → 로그아웃(Auth)·DB 세션 끝·쿠키 지움·로그인 화면(돌아갈 곳 = 그 경로, reason=session)", async () => {
    setFacts("fan", 10 * 24 * 60 * MIN, SESSION_LIFETIMES.member.idleMs);
    const res = await proxy(requestTo("/gifts/FC-7K3M9?tab=a", { ...live(), [SESSION_ONLY_COOKIE]: "1" }));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/gifts/FC-7K3M9?tab=a");
    expect(to.searchParams.get("reason")).toBe("session");
    expect([...to.searchParams.keys()].sort()).toEqual(["next", "reason"]);
    expect(fake.calls.some((u) => u.includes("/auth/v1/logout"))).toBe(true);
    expect(fns()).toContain("session_end");
    expect(fns()).not.toContain("session_touch");
    const lines = authLines(res);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/max-age=0/i);
    expect(res.headers.getSetCookie().find((l) => l.startsWith(`${SESSION_ONLY_COOKIE}=`))).toMatch(/max-age=0/i);
  });

  it("INV-L16 (S14b, 실패경로): 매일 써도 로그인한 지 30일이면 끝", async () => {
    setFacts("fan", SESSION_LIFETIMES.member.absoluteMs, MIN);
    const res = await proxy(requestTo("/me", live()));
    expect(res.status).toBe(307);
  });

  it("INV-L16 (S14c): 대표는 미사용 15분이면 끝, 같은 시간에 직원은 그대로", async () => {
    setFacts("operator", 60 * MIN, SESSION_LIFETIMES.owner.idleMs, true);
    expect((await proxy(requestTo("/admin", live()))).status).toBe(307);
    rpcCalls.length = 0;
    setFacts("operator", 60 * MIN, SESSION_LIFETIMES.owner.idleMs, false);
    expect((await proxy(requestTo("/admin", live()))).headers.get("location")).toBeNull();
  });

  it("INV-L17 (S15b, 실패경로): 다른 이유로 이미 끝난 세션(판정 재료 없음)은 쿠키를 지우고 로그인 화면으로 — 기간 안내(reason)는 없다", async () => {
    facts = null;
    const res = await proxy(requestTo("/me", live()));
    expect(res.status).toBe(307);
    const to = new URL(res.headers.get("location")!);
    expect(to.searchParams.get("reason")).toBeNull();
    expect(to.searchParams.get("next")).toBe("/me");
    for (const l of authLines(res)) expect(l).toMatch(/max-age=0/i);
    expect(hintLine(res)).toBeUndefined();
  });

  it("INV-L17 (S15): 크리에이터가 기간으로 끝났고 링크 템플릿이 등록돼 있어도 주소는 reason=session — 안내 줄 표시는 HttpOnly 쿠키(10분, /login)", async () => {
    setFacts("creator", 60 * MIN, SESSION_LIFETIMES.member.idleMs);
    linkReady = true;
    const res = await proxy(requestTo("/creator/actions", live()));
    const to = new URL(res.headers.get("location")!);
    expect([...to.searchParams.entries()]).toEqual([["next", "/creator/actions"], ["reason", "session"]]);
    expect(to.search).not.toContain(UNIT_USER.id);
    const hint = hintLine(res)!;
    expect(hint).toMatch(new RegExp(`^${LOGIN_HINT_COOKIE}=${LOGIN_HINT_LINK};`));
    expect(hint).toMatch(/httponly/i);
    expect(hint).toMatch(/samesite=lax/i);
    expect(hint).toMatch(/path=\/login(;|$)/i);
    expect(hint).toMatch(/max-age=600(;|$)/i);
  });

  it("INV-L17 (S15, 실패경로): 크리에이터라도 링크 템플릿 등록 전이면, 팬이면 안내 줄 표시 쿠키가 없다 — 주소는 똑같이 reason=session", async () => {
    setFacts("creator", 60 * MIN, SESSION_LIFETIMES.member.idleMs);
    linkReady = false;
    const a = await proxy(requestTo("/me", live()));
    expect(new URL(a.headers.get("location")!).searchParams.get("reason")).toBe("session");
    expect(hintLine(a)).toBeUndefined();
    setFacts("fan", 60 * MIN, SESSION_LIFETIMES.member.idleMs);
    linkReady = true;
    const b = await proxy(requestTo("/me", live()));
    expect(new URL(b.headers.get("location")!).searchParams.get("reason")).toBe("session");
    expect(hintLine(b)).toBeUndefined();
  });

  it("INV-L17: 로그인 화면 요청이면 안내 줄 표시 쿠키를 읽어 화면에 넘기고(요청 머리) 응답에서 지운다", async () => {
    const res = await proxy(requestTo("/login?next=%2Fme&reason=session", { [LOGIN_HINT_COOKIE]: LOGIN_HINT_LINK }));
    expect(res.headers.get(`x-middleware-request-${LOGIN_HINT_HEADER}`)).toBe(LOGIN_HINT_LINK);
    expect(hintLine(res)).toMatch(/max-age=0/i);
  });

  it("INV-L17 (실패경로): 브라우저가 보낸 안내 머리는 믿지 않는다 — 쿠키가 없으면 머리를 비운다", async () => {
    const req = new NextRequest("http://127.0.0.1:3000/login?reason=session", { headers: { [LOGIN_HINT_HEADER]: LOGIN_HINT_LINK } });
    const res = await proxy(req);
    expect(res.headers.get(`x-middleware-request-${LOGIN_HINT_HEADER}`) ?? "").toBe("");
  });

  it("INV-L16: API 요청은 로그인 화면으로 돌리지 않고 로그인 안 된 요청으로 넘긴다(쿠키는 지움)", async () => {
    setFacts("fan", 60 * MIN, SESSION_LIFETIMES.member.idleMs);
    const res = await proxy(requestTo("/api/me/profile", live()));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-cookie") ?? "").not.toContain(UNIT_AUTH_COOKIE);
    for (const l of authLines(res)) expect(l).toMatch(/max-age=0/i);
    expect(fns()).toContain("session_end");
  });

  it("INV-L16 · link-login INV-K5: 로그인 화면·로그인 링크 페이지는 돌리지 않는다(# 뒤 토큰이 주소에 남지 않게, 링크 로그인은 새 세션으로)", async () => {
    for (const path of ["/login", "/login/link"]) {
      setFacts("creator", 60 * MIN, SESSION_LIFETIMES.member.idleMs);
      const res = await proxy(requestTo(path, live()));
      expect(res.headers.get("location")).toBeNull();
      for (const l of authLines(res)) expect(l).toMatch(/max-age=0/i);
    }
  });

  it("INV-L16 (실패경로): 판정 재료를 못 읽으면(DB 오류) 운영자 주소가 아니면 통과 — 오래 가는 만료를 붙이지 않고, 서버 오류 기록에 토큰·ID 원문이 없다", async () => {
    factsError = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await proxy(requestTo("/me", expiring()));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-cookie") ?? "").toContain(UNIT_AUTH_COOKIE);
    const lines = authLines(res);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toMatch(/max-age/i);
    expect(errors).toHaveBeenCalled();
    const printed = errors.mock.calls.flat().map(String).join(" ");
    expect(printed).not.toContain(UNIT_USER.id);
    expect(printed).not.toContain(UNIT_SESSION_ID);
    errors.mockRestore();
  });

  it("INV-L16 (실패경로): 판정 재료를 못 읽으면 운영자 주소(/admin·관리자 API)는 로그인 안 함으로 — 요청에서 로그인 쿠키를 뺀다(세션은 끝내지 않는다)", async () => {
    factsError = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const path of ["/admin", "/admin/pricing", "/api/admin/pricing"]) {
      rpcCalls.length = 0;
      const res = await proxy(requestTo(path, live()));
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("x-middleware-request-cookie") ?? "").not.toContain(UNIT_AUTH_COOKIE);
      expect(fns()).not.toContain("session_end");
    }
    errors.mockRestore();
  });

  it("INV-L16 (실패경로): 운영자 주소처럼 보이는 다른 주소(/administrator)는 닫지 않는다", async () => {
    factsError = true;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await proxy(requestTo("/administrator", live()));
    expect(res.headers.get("x-middleware-request-cookie") ?? "").toContain(UNIT_AUTH_COOKIE);
    errors.mockRestore();
  });
});

describe("INV-L16 · INV-L15 (S14e·link-login S4): 갱신해 다시 쓰는 로그인 쿠키는 그 역할의 절대 기간", () => {
  it("INV-L16 (S14e): 팬·크리에이터는 30일", async () => {
    setFacts("creator", 60 * MIN, 10_000);
    const lines = authLines(await proxy(requestTo("/me", expiring())));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(new RegExp(`max-age=${sessionCookieMaxAgeSeconds("member")}(;|$)`, "i"));
  });

  it("INV-L16 (S14e): 운영자는 12시간", async () => {
    setFacts("operator", 60 * MIN, 10_000);
    const lines = authLines(await proxy(requestTo("/admin", expiring())));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(new RegExp(`max-age=${sessionCookieMaxAgeSeconds("staff")}(;|$)`, "i"));
  });

  it("INV-L15: 끄고 로그인한 표시가 있으면 역할과 상관없이 만료 시각이 없다", async () => {
    setFacts("fan", 60 * MIN, 10_000);
    const lines = authLines(await proxy(requestTo("/me", { ...expiring(), [SESSION_ONLY_COOKIE]: "1" })));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).not.toMatch(/max-age|expires/i);
  });
});
