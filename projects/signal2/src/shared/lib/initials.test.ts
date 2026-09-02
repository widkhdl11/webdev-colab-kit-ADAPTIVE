import { describe, expect, it } from "vitest";

import { initialsFor } from "./initials";

describe("initialsFor", () => {
  it("로마자는 두 글자를 남긴다 — 한 글자면 갈리지 않는다", () => {
    expect(initialsFor("GitHub")).toBe("Gi");
    expect(initialsFor("Google")).toBe("Go");
    expect(initialsFor("GitHub")).not.toBe(initialsFor("Google"));
  });

  it("공백이 든 이름도 앞에서부터 두 글자다", () => {
    expect(initialsFor("Hacker News")).toBe("Ha");
  });

  it("한글은 한 글자만 남긴다", () => {
    expect(initialsFor("개인 블로그")).toBe("개");
    expect(initialsFor("기술 뉴스레터")).toBe("기");
  });

  it("앞뒤 공백은 무시한다", () => {
    expect(initialsFor("  Anthropic  ")).toBe("An");
    expect(initialsFor("  문서 사이트")).toBe("문");
  });

  it("빈 이름은 빈 문자열이다", () => {
    expect(initialsFor("")).toBe("");
    expect(initialsFor("   ")).toBe("");
  });

  it("로마자가 아닌 글자는 한 글자다 — 두 글자를 남기면 원 밖으로 넘친다", () => {
    expect(initialsFor("日経")).toBe("日");
    expect(initialsFor("🔥신호")).toBe("🔥");
  });
});
