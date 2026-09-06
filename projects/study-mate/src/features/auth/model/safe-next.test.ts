import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("INV-A6: 로그인 뒤 돌아가는 곳은 이 사이트 안의 경로뿐이다", () => {
  it("INV-A6: 이 사이트 안의 경로는 그대로 쓴다", () => {
    // 반대 절반. 이게 없으면 "전부 홈으로 보낸다"로 바꿔도 아래가 전부 통과한다.
    expect(safeNextPath("/posts/abc")).toBe("/posts/abc");
    expect(safeNextPath("/posts?category=it&page=2")).toBe("/posts?category=it&page=2");
    expect(safeNextPath("/studies/1#members")).toBe("/studies/1#members");
    expect(safeNextPath("/")).toBe("/");
  });

  it("INV-A6: 다른 출처로 보내는 값은 전부 홈으로 떨어진다", () => {
    const outside = [
      "https://evil.example/login",
      "http://evil.example",
      "//evil.example",
      "///evil.example",
      "/\\evil.example", // 브라우저가 //evil.example 로 읽는다
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:someone@evil.example",
      "evil.example/path", // 슬래시로 시작하지 않는다
      "../../etc/passwd",
    ];
    for (const value of outside) {
      expect(safeNextPath(value), `막지 못한 값: ${value}`).toBe("/");
    }
  });

  it("INV-A6: 눈에 안 보이는 글자가 섞인 값은 지우지 않고 통째로 버린다", () => {
    // 지우고 쓰면 지운 결과가 또 다른 경로가 된다.
    expect(safeNextPath("/\n//evil.example")).toBe("/");
    expect(safeNextPath("/\t/evil.example")).toBe("/");
    expect(safeNextPath("/posts\r\nSet-Cookie: a=b")).toBe("/");
    expect(safeNextPath("/posts\u0000")).toBe("/");
    expect(safeNextPath("/posts\u007f")).toBe("/");
  });

  it("INV-A6 (S6): C1 구역(U+0080~U+009F)도 제어문자다", () => {
    // 유니코드가 제어문자로 분류하는 것은 C0 와 C1 둘인데 C0 만 보고 있었다.
    // 이 값은 Location 헤더에 실리고, 그 헤더를 latin-1 로 읽는 자리에서 C1 은
    // 한 바이트 제어문자가 된다.
    //
    // **이스케이프가 아니라 코드포인트로 적는다.** 이 파일이 도구를 거치는 동안
    // 유니코드 이스케이프가 실제 문자로 바뀐 적이 있고(0010 이 같은 이유로 SQL 에서
    // chr() 을 쓴다), 그때 검사가 무엇을 보는지가 조용히 달라진다.
    const c = (code: number) => "/posts" + String.fromCodePoint(code);
    for (const code of [0x80, 0x85, 0x9f]) {
      expect(safeNextPath(c(code)), `U+${code.toString(16).toUpperCase()} 를 통과시켰다`).toBe("/");
    }
  });

  it("INV-A6 (S6b, 반대 절반): C1 바로 밖의 글자는 그대로 통과한다", () => {
    // 경계를 양쪽에서 민다. 위 검사만 있으면 구역을 통째로 넓혀도 초록불이고,
    // 그러면 한글 경로가 전부 홈으로 떨어지는 것을 아무도 못 잡는다.
    const c = (code: number) => "/posts" + String.fromCodePoint(code);
    expect(safeNextPath(c(0x7e))).toBe(c(0x7e)); // ~ — C0 끝(0x7f) 바로 앞
    expect(safeNextPath(c(0xa0))).toBe(c(0xa0)); // NBSP — C1 끝(0x9f) 바로 뒤
    expect(safeNextPath("/스터디/한글")).toBe("/스터디/한글");
  });

  it("INV-A6: 값이 없거나 문자열이 아니면 홈이다", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});
