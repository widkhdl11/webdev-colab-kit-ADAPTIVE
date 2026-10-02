import { describe, expect, it } from "vitest";
import { isSameOriginJson } from "./same-origin";

const req = (headers: Record<string, string>) => new Headers({ host: "fankkuk.kr", ...headers });

describe("같은 사이트에서 보낸 JSON 요청만", () => {
  it("요청이 들어온 주소(Host)와 Origin 이 같고 JSON 이면 받는다", () => {
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr", "content-type": "application/json" }))).toBe(true);
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr", "content-type": "application/json; charset=utf-8" }))).toBe(true);
  });

  it("개발 서버를 127.0.0.1 로 열어도 받는다 — 서버가 아는 이름(localhost)이 아니라 요청이 들어온 주소와 비교한다", () => {
    const h = new Headers({ host: "127.0.0.1:3311", origin: "http://127.0.0.1:3311", "content-type": "application/json" });
    expect(isSameOriginJson(h)).toBe(true);
  });

  it("다른 사이트의 폼 전송(출처 다름·text/plain)은 받지 않는다 — 남의 계정으로 로그인시키는 공격", () => {
    expect(isSameOriginJson(req({ origin: "https://evil.example", "content-type": "application/json" }))).toBe(false);
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr.evil.example", "content-type": "application/json" }))).toBe(false);
    expect(isSameOriginJson(req({ origin: "https://fankkuk.kr", "content-type": "text/plain" }))).toBe(false);
    expect(isSameOriginJson(req({ "content-type": "application/json" }))).toBe(false);
    expect(isSameOriginJson(req({ origin: "null", "content-type": "application/json" }))).toBe(false);
    expect(isSameOriginJson(new Headers({ origin: "https://fankkuk.kr", "content-type": "application/json" }))).toBe(false);
  });
});
