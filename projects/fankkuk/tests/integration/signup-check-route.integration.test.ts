import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminClient, psql } from "./helpers";

// 아이디·닉네임 미리 확인 라우트(signup INV-U14)를 실제로 부른다. 바꾸는 것은 관리자 키를 만드는 자리(로컬 Supabase)뿐이다.
// 같은 사이트 검사·캐시 금지·접속 주소 해시·횟수 한도·DB 함수는 실제 코드와 로컬 DB 가 한다. 로그인 쿠키는 없다 — 로그인 없이 부른다.
// 접속 주소는 문서용 예약 대역(203.0.113.0/24, 198.51.100.0/24)만 쓴다.

vi.mock("@/shared/api/supabase/admin", () => ({ createAdminSupabase: () => adminClient() }));

const { POST } = await import("@/app/api/signup/check/route");

const SITE = "http://127.0.0.1:3311";

function req(body: unknown, opts: { origin?: string; ip?: string; contentType?: string } = {}): NextRequest {
  return new NextRequest(`${SITE}/api/signup/check`, {
    method: "POST",
    headers: {
      origin: opts.origin ?? SITE,
      host: "127.0.0.1:3311",
      "content-type": opts.contentType ?? "application/json",
      "x-forwarded-for": `${opts.ip ?? "203.0.113.10"}, 10.0.0.1`,
    },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown, opts?: Parameters<typeof req>[1]) {
  const res = await POST(req(body, opts));
  return { status: res.status, cache: res.headers.get("cache-control"), body: (await res.json()) as Record<string, unknown> };
}

let ipSeq = 0;
/** 시험마다 다른 접속 주소 — 앞 시험의 횟수가 섞이지 않게. */
function nextIp(): string {
  ipSeq += 1;
  return `198.51.100.${ipSeq}`;
}

const cleanup = () => psql(`delete from public.signup_check_hits;`);
beforeEach(cleanup);
afterAll(cleanup);

describe("INV-U14: 미리 확인 라우트", () => {
  it("INV-U14: 로그인 없이 부른다 — 답은 result 하나뿐, 캐시하지 않는다", async () => {
    const ip = nextIp();
    const taken = await call({ kind: "loginId", value: "haru_creator" }, { ip });
    expect(taken).toEqual({ status: 200, cache: "no-store", body: { result: "taken" } });
    expect(await call({ kind: "nickname", value: "HaRu" }, { ip })).toEqual({ status: 200, cache: "no-store", body: { result: "available" } });
    expect(await call({ kind: "nickname", value: "하루" }, { ip })).toEqual({ status: 200, cache: "no-store", body: { result: "taken" } });
    expect(await call({ kind: "loginId", value: "Bad Id" }, { ip })).toEqual({ status: 200, cache: "no-store", body: { result: "invalid" } });
  });

  it("INV-U14 (실패경로): 다른 사이트에서 온 요청·JSON 이 아닌 요청은 403, DB 를 부르지 않는다", async () => {
    const ip = nextIp();
    expect(await call({ kind: "loginId", value: "haru_creator" }, { ip, origin: "https://evil.example" })).toMatchObject({ status: 403, cache: "no-store" });
    expect(await call({ kind: "loginId", value: "haru_creator" }, { ip, contentType: "text/plain" })).toMatchObject({ status: 403, cache: "no-store" });
    expect(psql(`select count(*) from public.signup_check_hits;`)).toBe("0");
  });

  it("INV-U14 (실패경로): 모르는 종류·글자가 아닌 값은 400", async () => {
    expect(await call({ kind: "email", value: "a@b.c" }, { ip: nextIp() })).toMatchObject({ status: 400, cache: "no-store" });
    expect(await call({ kind: "loginId", value: 12 }, { ip: nextIp() })).toMatchObject({ status: 400, cache: "no-store" });
  });

  it("INV-U14 (실패경로): 한 접속 주소에서 31번째는 429 rate_limited — 다른 주소는 그대로 답한다", async () => {
    const ip = nextIp();
    for (let i = 0; i < 30; i += 1) expect((await call({ kind: "loginId", value: "haru_creator" }, { ip })).body).toEqual({ result: "taken" });
    expect(await call({ kind: "loginId", value: "haru_creator" }, { ip })).toEqual({ status: 429, cache: "no-store", body: { result: "rate_limited" } });
    expect((await call({ kind: "loginId", value: "haru_creator" }, { ip: nextIp() })).body).toEqual({ result: "taken" });
  });

  it("INV-U14: 접속 주소 원문은 어디에도 남지 않는다 — 표에는 해시만, 같은 주소는 같은 해시", async () => {
    const ip = nextIp();
    await call({ kind: "loginId", value: "haru_creator" }, { ip });
    await call({ kind: "loginId", value: "haru_creator" }, { ip });
    const rows = psql(`select ip_hash || '|' || hits from public.signup_check_hits;`).split("\n");
    expect(rows).toHaveLength(1);
    const [hash, hits] = rows[0]!.split("|");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hits).toBe("2");
    expect(psql(`select count(*) from public.signup_check_hits where ip_hash like '%${ip}%' or ip_hash like '%198.51%';`)).toBe("0");
  });
});
