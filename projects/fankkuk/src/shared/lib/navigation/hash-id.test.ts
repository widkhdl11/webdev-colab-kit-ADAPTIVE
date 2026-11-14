import { describe, expect, it } from "vitest";
import { hashIdOf } from "./hash-id";

describe("주소 끝 #이름 읽기", () => {
  it("# 을 떼고 % 인코딩을 푼다", () => {
    expect(hashIdOf("#fandom")).toBe("fandom");
    expect(hashIdOf("#%EC%83%9D%EC%9D%BC")).toBe("생일");
    expect(hashIdOf("")).toBe("");
    expect(hashIdOf("#")).toBe("");
  });

  it("(실패경로) 깨진 인코딩은 던지지 않고 빈 값", () => {
    expect(() => hashIdOf("#%E0")).not.toThrow();
    expect(hashIdOf("#%E0")).toBe("");
    expect(hashIdOf("#%")).toBe("");
  });
});
