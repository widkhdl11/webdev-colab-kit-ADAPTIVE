import { describe, expect, it } from "vitest";
import { withSubjectParticle } from "./subject-particle";

describe("withSubjectParticle", () => {
  it("받침이 있으면 「이」", () => {
    expect(withSubjectParticle("팬꾹")).toBe("팬꾹이");
  });
  it("받침이 없으면 「가」", () => {
    expect(withSubjectParticle("네오코드")).toBe("네오코드가");
  });
  it("한글이 아니면 「가」", () => {
    expect(withSubjectParticle("ABC")).toBe("ABC가");
  });
});
