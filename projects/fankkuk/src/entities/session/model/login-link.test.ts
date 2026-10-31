import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";
import {
  LINK_LOGIN_EXPIRED_MESSAGE,
  LINK_LOGIN_FAILED_PATH,
  LINK_LOGIN_SUCCESS_PATH,
  LOGIN_LINK_TOKEN_BYTES,
  loginLinkHashPrefix,
  loginLinkTokenHash,
  loginNoticeOf,
  newLoginLinkToken,
  readLoginLinkToken,
} from "./login-link";

// 알림톡 로그인 링크의 토큰 (docs/specs/link-login.md INV-K1·K4·K5).

describe("INV-K1: 토큰은 추측할 수 없는 32바이트, DB 에는 SHA-256 해시만", () => {
  it("INV-K1: 새 토큰은 32바이트 base64url 이고 해시는 그 토큰의 SHA-256 16진수다", () => {
    const { token, hash } = newLoginLinkToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(LOGIN_LINK_TOKEN_BYTES);
    expect(LOGIN_LINK_TOKEN_BYTES).toBe(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(loginLinkTokenHash(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("INV-K1 (실패경로): 토큰은 매번 다르다", () => {
    const seen = new Set(Array.from({ length: 50 }, () => newLoginLinkToken().token));
    expect(seen.size).toBe(50);
  });

  it("INV-K5: 로그에 쓰는 것은 해시 앞 8자뿐", () => {
    const { token, hash } = newLoginLinkToken();
    expect(loginLinkHashPrefix(hash)).toBe(hash.slice(0, 8));
    expect(loginLinkHashPrefix(hash)).not.toContain(token.slice(0, 8));
  });
});

describe("INV-K3·K4: 주소의 토큰 읽기", () => {
  it("INV-K4: 토큰 꼴이면 그대로", () => {
    const { token } = newLoginLinkToken();
    expect(readLoginLinkToken(token)).toBe(token);
  });

  it("INV-K4 (실패경로): 빈 값·길이가 다른 값·다른 글자·문자열 아님은 null", () => {
    expect(readLoginLinkToken("")).toBeNull();
    expect(readLoginLinkToken(undefined)).toBeNull();
    expect(readLoginLinkToken(123)).toBeNull();
    expect(readLoginLinkToken("a".repeat(42))).toBeNull();
    expect(readLoginLinkToken("a".repeat(44))).toBeNull();
    expect(readLoginLinkToken(`${"a".repeat(42)}=`)).toBeNull();
    expect(readLoginLinkToken(`${"a".repeat(42)}/`)).toBeNull();
  });
});

describe("INV-K4: 성공이면 승인 대기 목록, 실패면 로그인 화면(돌아갈 곳은 승인 대기 목록)", () => {
  it("INV-K4: 성공 경로는 /creator/actions", () => {
    expect(LINK_LOGIN_SUCCESS_PATH).toBe("/creator/actions");
  });

  it("INV-K4 · INV-L13: 실패 경로는 로그인 화면이고, 그 next 는 safeNextPath 를 통과해 /creator/actions 다", () => {
    const url = new URL(LINK_LOGIN_FAILED_PATH, "https://fankkuk.com");
    expect(url.pathname).toBe("/login");
    expect(safeNextPath(url.searchParams.get("next"))).toBe("/creator/actions");
    expect(loginNoticeOf(url.searchParams.get("link"))).toBe(LINK_LOGIN_EXPIRED_MESSAGE);
  });

  it("INV-K4: 실패 문구는 하나 — 사유를 나누지 않는다", () => {
    expect(LINK_LOGIN_EXPIRED_MESSAGE).toBe("로그인 링크가 만료됐습니다.");
    expect(loginNoticeOf("used")).toBeNull();
    expect(loginNoticeOf(null)).toBeNull();
    expect(loginNoticeOf(["expired"])).toBeNull();
  });
});
