import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "./session-cookies";

describe("INV-L1: 로그인 토큰 쿠키는 스크립트가 읽을 수 없다", () => {
  it("INV-L1 (S1): 개발 환경에서도 HttpOnly·SameSite=Lax 다", () => {
    expect(sessionCookieOptions({ NODE_ENV: "development" })).toEqual({ path: "/", sameSite: "lax", httpOnly: true, secure: false });
  });

  it("INV-L1: 운영 환경(NODE_ENV 또는 VERCEL_ENV)에서는 Secure 가 붙는다", () => {
    expect(sessionCookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
    expect(sessionCookieOptions({ NODE_ENV: "development", VERCEL_ENV: "production" }).secure).toBe(true);
    expect(sessionCookieOptions({ NODE_ENV: "production" }).httpOnly).toBe(true);
  });
});
