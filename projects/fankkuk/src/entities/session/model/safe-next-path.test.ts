import { describe, expect, it } from "vitest";
import { HOME_PATH, safeNextPath } from "./safe-next-path";

// session-login INV-L13 (S11): 로그인 뒤 돌아갈 주소는 같은 사이트의 경로만 받는다. 아니면 메인.

describe("INV-L13: 돌아갈 주소는 같은 사이트의 경로만", () => {
  it.each([
    ["/help", "/help"],
    ["/gifts/FC-7K3M9", "/gifts/FC-7K3M9"],
    ["/support?tab=inquiry#form", "/support?tab=inquiry#form"],
    ["/creators/%ED%95%98%EB%A3%A8", "/creators/%ED%95%98%EB%A3%A8"],
  ])("INV-L13 S11: 같은 사이트 경로 %s 는 그대로 돌려준다", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    ["//evil.example", "앞이 // — 다른 사이트 주소로 읽힌다"],
    ["//evil.example/login", "앞이 //"],
    ["/\\evil.example", "앞이 /\\ — 브라우저가 // 로 읽는다"],
    ["/a\\b", "가운데 역슬래시"],
    ["https://evil.example", "절대 주소"],
    ["http://127.0.0.1:3311/me", "우리 사이트라도 절대 주소는 받지 않는다"],
    ["javascript:alert(1)", "/ 로 시작하지 않는다"],
    ["/redirect?to=https://evil.example", "가운데 :// 가 있다"],
    ["evil.example", "/ 로 시작하지 않는다"],
    [" /help", "앞에 공백"],
    ["/a\r\nSet-Cookie: x=1", "제어 문자(줄바꿈)"],
    ["/a\tb", "제어 문자(탭)"],
    ["/a\u0000b", "제어 문자(널)"],
    ["/a%0d%0a", "인코딩된 제어 문자 — 풀면 줄바꿈"],
    ["/%2F%2Fevil.example", "인코딩된 // — 풀면 //evil.example"],
    ["/%2fevil.example", "인코딩된 / 하나 — 풀면 //evil.example"],
    ["/%5Cevil.example", "인코딩된 역슬래시"],
    ["/%252F%252Fevil.example", "두 번 인코딩된 //"],
    ["/%25252F%25252Fevil.example", "세 번 인코딩된 //"],
    ["/x?u=https%3A%2F%2Fevil.example", "인코딩된 ://"],
    ["/%E0%A4%A", "풀 수 없는 인코딩"],
    ["/%2525252541", "다섯 겹으로 감싼 값 — 끝까지 풀어 보지 않는다"],
    ["", "빈 값"],
    ["/", "메인 그대로"],
  ])("INV-L13 S11 (실패경로): %j 는 메인으로 (%s)", (raw, _why) => {
    expect(safeNextPath(raw)).toBe(HOME_PATH);
  });

  it("INV-L13 S11 (실패경로): 글자가 아닌 값·너무 긴 값은 메인으로", () => {
    for (const raw of [undefined, null, 123, ["/help"], { path: "/help" }, `/${"a".repeat(600)}`]) {
      expect(safeNextPath(raw)).toBe(HOME_PATH);
    }
  });

  it("INV-L13: 메인은 / 이다", () => {
    expect(HOME_PATH).toBe("/");
  });
});
