import { describe, expect, it } from "vitest";
import { LOGIN_HINT_COOKIE, LOGIN_HINT_LINK, LOGIN_HINT_MAX_AGE_SECONDS, SESSION_END_LINK_HINT, SESSION_END_MESSAGE, SESSION_END_REASON, sessionEndNoticeOf } from "./session-end-notice";

// 기간으로 끝나 로그인 화면에 왔을 때의 안내 (docs/specs/session-login.md INV-L17).

describe("INV-L17: 주소의 표시는 누구에게나 reason=session 하나, 알림톡 안내 줄은 서버 쿠키로만", () => {
  it("INV-L17 (S15): reason=session → 「보안을 위해 다시 로그인해 주세요.」", () => {
    expect(SESSION_END_REASON).toBe("session");
    expect(SESSION_END_MESSAGE).toBe("보안을 위해 다시 로그인해 주세요.");
    expect(sessionEndNoticeOf("session", false)).toBe(SESSION_END_MESSAGE);
  });

  it("INV-L17 (S15): 링크 안내 표시(서버 쿠키)가 있으면 한 줄 더", () => {
    expect(SESSION_END_LINK_HINT).toBe("승인 요청 알림톡의 [승인 화면 열기]를 누르면 바로 로그인됩니다.");
    expect(sessionEndNoticeOf("session", true)).toBe(`${SESSION_END_MESSAGE} ${SESSION_END_LINK_HINT}`);
  });

  it("INV-L17 (S15b, 실패경로): reason 이 없으면 링크 안내 표시가 있어도 안내 없음 · 옛 표시(session_link)·모르는 값도 없음", () => {
    expect(sessionEndNoticeOf(undefined, true)).toBeNull();
    expect(sessionEndNoticeOf("", false)).toBeNull();
    expect(sessionEndNoticeOf("session_link", true)).toBeNull();
    expect(sessionEndNoticeOf(["session"], false)).toBeNull();
  });

  it("INV-L17: 링크 안내 표시 쿠키는 10분", () => {
    expect(LOGIN_HINT_MAX_AGE_SECONDS).toBe(600);
    expect(LOGIN_HINT_COOKIE).toMatch(/^fk_/);
    expect(LOGIN_HINT_LINK).toBe("link");
  });
});
