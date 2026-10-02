import { describe, expect, it } from "vitest";
import { verificationCookieOptions, withVerificationFromCookie } from "./verification-cookie";

const MINE = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

describe("INV-U1 (S1c): 번호표는 그것을 받은 브라우저의 쿠키에서만 온다", () => {
  it("INV-U1 (S1c, 실패경로): 본문에 남이 받은 번호표를 넣어도 쿠키의 번호표를 쓴다", () => {
    expect(withVerificationFromCookie({ loginId: "a", verificationId: OTHER }, MINE)).toEqual({ loginId: "a", verificationId: MINE });
  });

  it("INV-U1 (S1c, 실패경로): 쿠키가 없으면 본문의 번호표를 지운다 — 다른 브라우저에서 번호표만 들고 와도 쓸 수 없다", () => {
    expect(withVerificationFromCookie({ loginId: "a", verificationId: OTHER }, undefined)).toEqual({ loginId: "a" });
  });

  it("본문이 객체가 아니면 번호표만 담은 객체", () => {
    expect(withVerificationFromCookie("x", MINE)).toEqual({ verificationId: MINE });
    expect(withVerificationFromCookie(null, undefined)).toEqual({});
  });

  it("INV-L1 과 같은 쿠키 속성 — 스크립트가 못 읽고, 가입 주소에만 붙고, 운영에서는 https 전용", () => {
    expect(verificationCookieOptions({ NODE_ENV: "development" })).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/api/signup",
      maxAge: 1200,
    });
    expect(verificationCookieOptions({ NODE_ENV: "production" }).secure).toBe(true);
  });
});
