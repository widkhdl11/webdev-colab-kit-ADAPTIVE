import { describe, expect, it } from "vitest";
import { sessionCookie } from "./together-helpers";

// 운영자 로그인을 실제 서버에서 부른다 (admin-console INV-K13). Auth·DB 판정 함수(is_operator)는 로컬 Supabase 의 진짜다.
// 떠 있는 개발 서버(기본 http://localhost:3000, FK_TEST_APP_URL 로 바꿈)에 보낸다 — 서버가 꺼져 있으면 실패다.

const APP = process.env.FK_TEST_APP_URL ?? "http://localhost:3000";
const PW = "fankkuk-local-1234";

async function adminLogin(body: unknown): Promise<Response> {
  return fetch(`${APP}/api/auth/admin-login`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: new URL(APP).origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 응답의 로그인 쿠키 줄 전부(지우기 포함) */
function anyAuthCookieLines(res: Response): string[] {
  return res.headers.getSetCookie().filter((l) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(l));
}

/** 응답이 값을 실어 쓴 로그인 쿠키 줄(지우기 줄은 뺀다) */
function authCookieLines(res: Response): string[] {
  return res.headers.getSetCookie().filter((l) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(l) && !/^[^=]+=;/.test(l) && !/max-age=0/i.test(l));
}

describe("INV-K13: 운영자 로그인 화면으로는 운영자만 로그인된다", () => {
  it.each(["fankkuk_admin", "fankkuk_staff"])("INV-K13 (S13·S13d): %s → 200, 돌아갈 관리자 주소, 로그인 쿠키는 만료 시각 없이", async (loginId) => {
    const res = await adminLogin({ loginId, password: PW, next: "/admin/metrics", keepSignedIn: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: "/admin/metrics" });
    const lines = authCookieLines(res);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).not.toMatch(/max-age|expires/i);
  });

  it.each(["byeolbit_fan", "haru_creator"])("INV-K13 (S13b, 실패경로): %s 의 맞는 비밀번호 → 틀린 비밀번호와 같은 401, 로그인 쿠키가 남지 않는다", async (loginId) => {
    const right = await adminLogin({ loginId, password: PW });
    const wrong = await adminLogin({ loginId, password: `${PW}-x` });
    expect(right.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await right.json()).toEqual(await wrong.json());
    // 쿠키 줄도 틀린 비밀번호와 같다(지우기 줄조차 없다) — 응답 머리로도 비밀번호가 맞았는지 알 수 없다
    expect(anyAuthCookieLines(right)).toEqual([]);
    expect(anyAuthCookieLines(wrong)).toEqual([]);
  });

  it("INV-K13 (S13b, 실패경로): 팬으로 로그인한 채 크리에이터의 맞는 비밀번호를 넣어도 팬의 로그인 쿠키를 건드리지 않고, 그 팬 세션은 그대로 쓰인다", async () => {
    const fanCookie = await sessionCookie("byeolbit_fan@fankkuk.test", PW);
    const res = await fetch(`${APP}/api/auth/admin-login`, {
      method: "POST",
      redirect: "manual",
      headers: { origin: new URL(APP).origin, "content-type": "application/json", cookie: fanCookie },
      body: JSON.stringify({ loginId: "haru_creator", password: PW }),
    });
    expect(res.status).toBe(401);
    expect(anyAuthCookieLines(res)).toEqual([]);
    // 팬 세션이 살아 있다 — 관리자 주소에서 손님(로그인 화면으로)이 아니라 로그인한 팬(404)으로 판정된다
    const admin = await fetch(`${APP}/admin`, { redirect: "manual", headers: { accept: "text/html", cookie: fanCookie } });
    expect(admin.status).toBe(404);
  });

  it("INV-K13 (S13c, 실패경로): 돌아갈 곳이 관리자 화면 밖이면 관리자 첫 화면", async () => {
    const res = await adminLogin({ loginId: "fankkuk_admin", password: PW, next: "//evil.example/admin" });
    expect(await res.json()).toEqual({ ok: true, next: "/admin" });
  });

  it("INV-K13: 운영자 로그인 화면은 손님에게 200 이고 검색엔진에 싣지 않는다", async () => {
    const res = await fetch(`${APP}/admin/login`, { redirect: "manual", headers: { accept: "text/html" } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("팬꾹 운영자");
    expect(html).toMatch(/<meta name="robots" content="noindex, ?nofollow"/);
  });
});
