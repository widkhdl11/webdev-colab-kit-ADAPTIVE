import { describe, expect, it } from "vitest";
import { decideRouteAccess } from "./route-access";

describe("decideRouteAccess", () => {
  describe("INV-A1: 보호된 경로에 세션 없이 들어오면 로그인 페이지로 보낸다", () => {
    it.each([
      ["/posts/create"],
      ["/studies"],
      ["/studies/123"],
      ["/studies/123/members"],
      ["/profile"],
      ["/profile/edit"],
      ["/chats"],
      ["/chats/42"],
      ["/posts/123/edit"],
      ["/posts/abc-def/edit"],
    ])("INV-A1: 세션 없이 %s 를 열면 /login 으로 보낸다", (pathname) => {
      expect(decideRouteAccess({ pathname, signedIn: false })).toEqual({
        kind: "redirect",
        to: "/login",
      });
    });

    it("INV-A1(실패경로 S1b): 보호 목록에 없는 /posts 목록은 세션 없이도 그대로 보여준다", () => {
      expect(decideRouteAccess({ pathname: "/posts", signedIn: false })).toEqual({
        kind: "allow",
      });
    });

    it("INV-A1(경계): /posts/created 는 /posts/create 로 시작할 뿐 다른 경로라 보호 대상이 아니다", () => {
      expect(decideRouteAccess({ pathname: "/posts/created", signedIn: false })).toEqual({
        kind: "allow",
      });
    });

    it.each([["/posts/123"], ["/posts/123/comments"], ["/posts/123/editor"]])(
      "INV-A1(과차단 X): %s 는 보호 대상이 아니다 — 발견은 로그인 앞에 있어야 한다",
      (pathname) => {
        expect(decideRouteAccess({ pathname, signedIn: false })).toEqual({ kind: "allow" });
      },
    );

    it("INV-A1(반대 절반): 세션이 있으면 보호된 경로를 그대로 보여준다", () => {
      expect(decideRouteAccess({ pathname: "/studies/123", signedIn: true })).toEqual({
        kind: "allow",
      });
    });
  });

  describe("INV-A2: 로그인한 사용자가 로그인·회원가입 페이지로 오면 홈으로 보낸다", () => {
    it.each([["/login"], ["/signup"]])(
      "INV-A2: 로그인 상태로 %s 를 열면 / 로 보낸다",
      (pathname) => {
        expect(decideRouteAccess({ pathname, signedIn: true })).toEqual({
          kind: "redirect",
          to: "/",
        });
      },
    );

    it("INV-A2(반대 절반): 세션이 없으면 /login 을 그대로 보여준다", () => {
      expect(decideRouteAccess({ pathname: "/login", signedIn: false })).toEqual({
        kind: "allow",
      });
    });

    it("INV-A2(경계): /loginhelp 는 /login 이 아니라 홈으로 보내지 않는다", () => {
      expect(decideRouteAccess({ pathname: "/loginhelp", signedIn: true })).toEqual({
        kind: "allow",
      });
    });
  });

  it("INV-A1 · INV-A2: 어느 목록에도 없는 홈은 세션 유무와 무관하게 그대로 보여준다", () => {
    expect(decideRouteAccess({ pathname: "/", signedIn: false })).toEqual({ kind: "allow" });
    expect(decideRouteAccess({ pathname: "/", signedIn: true })).toEqual({ kind: "allow" });
  });
});

describe("경로 정리 — 목록 비교 전에 대소문자와 겹친 슬래시를 정리한다", () => {
  it("INV-A1: 대문자가 섞인 보호 경로도 로그인으로 보낸다", () => {
    expect(decideRouteAccess({ pathname: "/Studies/123", signedIn: false })).toEqual({
      kind: "redirect",
      to: "/login",
    });
  });

  it("INV-A1: 슬래시가 겹친 보호 경로도 로그인으로 보낸다", () => {
    expect(decideRouteAccess({ pathname: "//studies//123", signedIn: false })).toEqual({
      kind: "redirect",
      to: "/login",
    });
  });

  it("INV-A2: 대문자가 섞인 로그인 경로도 로그인 상태면 홈으로 보낸다", () => {
    expect(decideRouteAccess({ pathname: "/Login", signedIn: true })).toEqual({
      kind: "redirect",
      to: "/",
    });
  });

  it("정리해도 보호 대상이 아닌 경로는 그대로 통과한다", () => {
    expect(decideRouteAccess({ pathname: "//Posts", signedIn: false })).toEqual({
      kind: "allow",
    });
  });
});
