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

  it("INV-A6: 값이 없거나 문자열이 아니면 홈이다", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
  });
});
