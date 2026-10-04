import { describe, expect, it } from "vitest";
import { isStaleFailure } from "./post-json-client";

describe("isStaleFailure", () => {
  it("409·404 실패만 화면을 다시 읽을 실패로 본다", () => {
    expect(isStaleFailure({ kind: "failed", status: 409, message: "" })).toBe(true);
    expect(isStaleFailure({ kind: "failed", status: 404, message: "" })).toBe(true);
    expect(isStaleFailure({ kind: "failed", status: 400, message: "" })).toBe(false);
    expect(isStaleFailure({ kind: "failed", status: 0, message: "" })).toBe(false);
    expect(isStaleFailure({ kind: "ok", body: {} })).toBe(false);
  });
});
