import { describe, expect, it } from "vitest";
import { sourceMark } from "./source-mark";

describe("sourceMark", () => {
  it("한글 출처는 한 글자", () => {
    expect(sourceMark("개인 블로그")).toBe("개");
    expect(sourceMark("기술 뉴스레터")).toBe("기");
    expect(sourceMark("문서 사이트")).toBe("문");
  });

  it("로마자 출처는 두 글자 — 한 글자면 GitHub 과 Google 이 구별되지 않는다", () => {
    expect(sourceMark("GitHub")).toBe("Gi");
    expect(sourceMark("Hacker News")).toBe("Ha");
    expect(sourceMark("Anthropic 블로그")).toBe("An");
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(sourceMark("  GitHub ")).toBe("Gi");
    expect(sourceMark(" 개인 블로그")).toBe("개");
  });

  it("빈 출처여도 원이 비어 보이지 않게 한다", () => {
    expect(sourceMark("")).toBe("·");
    expect(sourceMark("   ")).toBe("·");
  });

  it("한 글자짜리 로마자 출처는 그 한 글자만", () => {
    expect(sourceMark("X")).toBe("X");
  });
});
