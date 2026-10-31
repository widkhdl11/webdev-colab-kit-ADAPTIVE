// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { LINK_LOGIN_FAILED_PATH, LINK_LOGIN_SUCCESS_PATH, newLoginLinkToken } from "@/entities/session/model/login-link";

// 로그인 링크 페이지 (docs/specs/link-login.md INV-K3·K5).
// 여는 것(GET)은 아무것도 쓰지 않는다 — 서버 키·세션 클라이언트를 만들기만 해도 실패로 본다.
// 페이지 스크립트는 jsdom 창에서 실제로 돌려, 토큰을 같은 사이트 JSON POST 로 보내고 응답 뒤 주소창에서 지우는지 본다.

const touched: string[] = [];
vi.mock("@/shared/api/supabase/admin", () => ({
  createAdminSupabase: () => {
    touched.push("admin");
    return {};
  },
}));
vi.mock("@/shared/api/supabase/server", () => ({
  createRequestSupabase: async () => {
    touched.push("session");
    return {};
  },
  createDeferredRequestSupabase: async () => {
    touched.push("deferred");
    return {};
  },
}));

const { GET } = await import("./route");

// jsdom 은 형 정의 묶음이 없어 쓰는 모양만 적는다. 주소를 문자열로 넘겨 형 검사가 모듈 형을 찾지 않게 한다.
type FakeWindow = { document: Document; location: Location; history: History; __fkMove?: (to: string) => void; fetch?: unknown };
type JsdomCtor = new (html: string, opts?: { url?: string; runScripts?: "dangerously"; beforeParse?: (w: FakeWindow) => void }) => { window: FakeWindow };
const JSDOM_MODULE: string = "jsdom";
const { JSDOM } = (await import(/* @vite-ignore */ JSDOM_MODULE)) as { JSDOM: JsdomCtor };

const SITE = "http://127.0.0.1:3000";

/** 링크를 연다 — 라우트는 요청을 읽지 않는다(주소의 토큰도 서버가 보지 않는다). 주소는 스크립트를 돌릴 때 jsdom 에 준다. */
async function open(_token: string) {
  return GET();
}

describe("INV-K3: 링크를 여는 것(GET)만으로는 토큰을 쓰지 않는다", () => {
  it("INV-K3 (S2): GET 은 서버 키·세션 클라이언트를 만들지 않고 페이지만 돌려준다", async () => {
    touched.length = 0;
    const res = await open(newLoginLinkToken().token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(touched).toEqual([]);
  });

  it("INV-K3 (S2): 페이지 본문에 토큰이 박혀 있지 않다 — 스크립트가 주소에서 읽는다", async () => {
    const { token } = newLoginLinkToken();
    const html = await (await open(token)).text();
    expect(html).not.toContain(token);
  });
});

describe("INV-K5: 토큰이 다른 사이트로 새지 않는다", () => {
  it("INV-K5: Referrer-Policy: no-referrer · no-store", async () => {
    const res = await open(newLoginLinkToken().token);
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("INV-K5: 사이트 설정 헤더도 이 경로에는 no-referrer — 같은 이름은 나중 항목이 이기므로 마지막으로 맞는 값을 본다", async () => {
    const { default: nextConfig } = await import("../../../../../next.config");
    const rules = (await nextConfig.headers!()) as { source: string; headers: { key: string; value: string }[] }[];
    const matches = (source: string, path: string) => new RegExp(`^${source.replace("(.*)", ".*")}$`).test(path);
    const values = rules.filter((r) => matches(r.source, "/login/link")).flatMap((r) => r.headers.filter((h) => h.key === "Referrer-Policy").map((h) => h.value));
    expect(values.at(-1)).toBe("no-referrer");
    // 다른 화면은 그대로
    const other = rules.filter((r) => matches(r.source, "/login")).flatMap((r) => r.headers.filter((h) => h.key === "Referrer-Policy").map((h) => h.value));
    expect(other.at(-1)).toBe("strict-origin-when-cross-origin");
  });

  it("INV-K5: 외부 리소스를 부르지 않는다 — script src·link·img·iframe·스타일 url() 이 없다", async () => {
    const html = await (await open(newLoginLinkToken().token)).text();
    const d = new JSDOM(html).window.document;
    expect(d.querySelectorAll("script[src], link, img, iframe, object, embed, video, audio, source").length).toBe(0);
    expect(html).not.toMatch(/url\(|@import|https?:\/\//i);
    expect(d.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe("no-referrer");
  });
});

/** 페이지를 jsdom 창에서 그 주소로 열어 스크립트를 실제로 돌린다. fetch 는 답을 정해 둔 가짜, 이동은 기록만 한다. */
async function runPage(token: string | null, answer: { ok: boolean; next: string } | "network-error", where: "hash" | "query" = "hash") {
  const html = await (await open(token ?? "")).text();
  const posts: { url: string; init: RequestInit }[] = [];
  const moves: string[] = [];
  const dom = new JSDOM(html, {
    url: token === null ? `${SITE}/login/link` : `${SITE}/login/link${where === "hash" ? "#" : "?"}t=${token}`,
    runScripts: "dangerously",
    beforeParse(w) {
      w.__fkMove = (to) => moves.push(to);
      w.fetch = async (u: string, init: RequestInit) => {
        posts.push({ url: u, init });
        if (answer === "network-error") throw new Error("offline");
        return { ok: true, json: async () => answer };
      };
    },
  });
  for (let i = 0; i < 20 && moves.length === 0; i++) await new Promise((r) => setTimeout(r, 5));
  return { posts, moves, location: dom.window.location.href };
}

describe("INV-K3·K5: 페이지 스크립트 — 같은 사이트 JSON POST, 응답 뒤 주소창에서 토큰을 지우고 이동", () => {
  it("INV-K3 · INV-K5 (S1): 토큰을 JSON 으로 /api/auth/link 에 보내고, 주소창에서 지운 뒤 서버가 준 곳으로", async () => {
    const { token } = newLoginLinkToken();
    const { posts, moves, location } = await runPage(token, { ok: true, next: LINK_LOGIN_SUCCESS_PATH });
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toBe("/api/auth/link");
    expect(posts[0]!.init.method).toBe("POST");
    expect((posts[0]!.init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(JSON.parse(posts[0]!.init.body as string)).toEqual({ t: token });
    expect(posts[0]!.init.credentials).toBe("same-origin");
    expect(location).toBe(`${SITE}/login/link`);
    expect(moves).toEqual([LINK_LOGIN_SUCCESS_PATH]);
  });

  it("INV-K4 · INV-K5 (S1b, 실패경로): 실패 응답이면 주소창에서 지우고 로그인 화면으로", async () => {
    const { posts, moves, location } = await runPage(newLoginLinkToken().token, { ok: false, next: LINK_LOGIN_FAILED_PATH });
    expect(posts).toHaveLength(1);
    expect(location).toBe(`${SITE}/login/link`);
    expect(moves).toEqual([LINK_LOGIN_FAILED_PATH]);
  });

  it("INV-K4 (실패경로): 응답을 못 받으면 로그인 화면으로", async () => {
    const { moves, location } = await runPage(newLoginLinkToken().token, "network-error");
    expect(location).toBe(`${SITE}/login/link`);
    expect(moves).toEqual([LINK_LOGIN_FAILED_PATH]);
  });

  it("INV-K4 (실패경로): 서버가 준 next 가 다른 사이트 주소면 따르지 않고 로그인 화면으로", async () => {
    const { moves } = await runPage(newLoginLinkToken().token, { ok: true, next: "//evil.example/x" });
    expect(moves).toEqual([LINK_LOGIN_FAILED_PATH]);
  });

  it("INV-K1 · S3 (실패경로): 쿼리(?t=)로 온 토큰은 보내지 않고 주소창에서 지운 뒤 로그인 화면으로 — 서버 요청 기록에 남은 주소는 쓰지 않는다", async () => {
    const { posts, moves, location } = await runPage(newLoginLinkToken().token, { ok: true, next: LINK_LOGIN_SUCCESS_PATH }, "query");
    expect(posts).toHaveLength(0);
    expect(location).toBe(`${SITE}/login/link`);
    expect(moves).toEqual([LINK_LOGIN_FAILED_PATH]);
  });

  it("INV-K4: 주소에 토큰이 없으면 보내지 않고 로그인 화면으로", async () => {
    const { posts, moves } = await runPage(null, { ok: true, next: LINK_LOGIN_SUCCESS_PATH });
    expect(posts).toHaveLength(0);
    expect(moves).toEqual([LINK_LOGIN_FAILED_PATH]);
  });
});
