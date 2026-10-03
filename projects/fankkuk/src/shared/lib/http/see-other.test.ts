import { describe, expect, it } from "vitest";
import { seeOther } from "./see-other";

describe("같은 사이트 경로로 보내기", () => {
  it("Location 에 주소 없이 경로만 싣는다 — 127.0.0.1 로 연 화면이 localhost 로 넘어가지 않는다", () => {
    const res = seeOther("/gifts/G-1?paid=1");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/gifts/G-1?paid=1");
  });

  it("다른 사이트로 가는 값은 받지 않는다", () => {
    for (const bad of ["https://evil.example/", "//evil.example/", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "gifts/new"]) {
      expect(() => seeOther(bad)).toThrow();
    }
  });
});
