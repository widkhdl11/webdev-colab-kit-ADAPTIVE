import { describe, expect, it } from "vitest";
import { isSameOriginJson } from "./same-origin";

const req = (headers: Record<string, string>) => ({ headers: new Headers(headers), origin: "https://fankkuk.kr" });

describe("같은 사이트에서 보낸 JSON 요청만", () => {
  it("같은 출처 + JSON 이면 받는다", () => {
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr", "content-type": "application/json" }))).toBe(true);
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr", "content-type": "application/json; charset=utf-8" }))).toBe(true);
  });

  it("다른 사이트의 폼 전송(출처 다름·text/plain)은 받지 않는다 — 남의 계정으로 로그인시키는 공격", () => {
    expect(isSameOriginJson(req({ origin: "https://evil.example", "content-type": "application/json" }))).toBe(false);
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr", "content-type": "text/plain" }))).toBe(false);
    expect(isSameOriginJson(req({ "content-type": "application/json" }))).toBe(false);
    expect(isSameOriginJson(req({ origin: "null", "content-type": "application/json" }))).toBe(false);
  });
});
