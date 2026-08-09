import { describe, expect, it } from "vitest";
import { ARTICLE_TAGS } from "../model/types";
import { mergeTags, tagsFromText } from "./tagging";

/**
 * INV-T3: 태그는 **제목 키워드 규칙과 AI 분류를 합쳐서** 붙인다.
 * 둘 중 하나만 골라도 붙고, 둘 다 골라도 한 번만 붙는다. 목록 밖 태그는 안 만든다.
 */

describe("tagsFromText — 제목 키워드 규칙", () => {
  it("INV-T3: 제목의 키워드로 태그를 고른다", () => {
    expect(tagsFromText("MCP 서버를 처음 붙일 때")).toContain("MCP");
    expect(tagsFromText("새 에이전트 프레임워크 공개")).toContain("에이전트");
  });

  it("INV-T3: 영어 키워드도 잡는다 (제목이 대부분 영어다)", () => {
    // 2026-08-09 실측: 수집된 70건 중 한국어 제목은 0건이었다.
    expect(tagsFromText("Real-time MCP interceptor")).toContain("MCP");
    expect(tagsFromText("Building coding agents that scale")).toContain("에이전트");
    expect(tagsFromText("Claude Opus 5 model card")).toContain("모델");
  });

  it("INV-T3: 대소문자를 가리지 않는다", () => {
    expect(tagsFromText("mcp server setup")).toContain("MCP");
    expect(tagsFromText("MCP SERVER SETUP")).toContain("MCP");
  });

  it("INV-T3: 한 글에 여러 태그가 붙는다", () => {
    const tags = tagsFromText("Agent tooling for MCP servers");
    expect(tags).toContain("에이전트");
    expect(tags).toContain("MCP");
  });

  it("INV-T3: 같은 키워드가 여러 번 나와도 태그는 하나", () => {
    expect(tagsFromText("MCP, MCP, and more MCP").filter((t) => t === "MCP")).toHaveLength(1);
  });

  it("본문도 함께 볼 수 있다", () => {
    expect(tagsFromText("제목만으로는 모름", "본문에 MCP 이야기가 있다")).toContain("MCP");
  });

  describe("실패 경로 — 없는 것을 만들지 않는다", () => {
    it("INV-T3 실패경로: 짚이는 게 없으면 빈 배열", () => {
      expect(tagsFromText("Should you stop cracking your knuckles?")).toEqual([]);
    });

    it("INV-T3 실패경로: 단어 안에 우연히 든 글자로 붙지 않는다", () => {
      // 'tool' 이 'toolbar' 에 들어 있다고 '툴' 을 붙이면 오분류가 쌓인다.
      expect(tagsFromText("Toolbars considered harmful")).not.toContain("툴");
      // 'MCP' 가 'MCPU' 같은 것에 들어 있을 때도 마찬가지.
      expect(tagsFromText("The MCPU architecture")).not.toContain("MCP");
    });

    it("빈 입력에도 던지지 않는다", () => {
      expect(tagsFromText("")).toEqual([]);
      expect(tagsFromText(undefined as unknown as string)).toEqual([]);
    });
  });
});

describe("mergeTags — 규칙과 AI 를 합친다", () => {
  it("INV-T3 (S21): 둘이 고른 것을 모두 붙인다", () => {
    expect(mergeTags(["MCP"], ["툴"]).sort()).toEqual(["MCP", "툴"]);
  });

  it("INV-T3: 겹치면 한 번만", () => {
    expect(mergeTags(["MCP"], ["MCP", "툴"]).sort()).toEqual(["MCP", "툴"]);
  });

  it("INV-T3 (S22) 실패경로: 목록에 없는 태그는 버린다", () => {
    // AI 가 '블록체인' 을 고르면 그 태그가 새로 생겨 필터가 늘어난다.
    expect(mergeTags([], ["블록체인", "MCP"])).toEqual(["MCP"]);
  });

  it("INV-T3 실패경로: 문자열이 아닌 값이 섞여도 버티고 거른다", () => {
    expect(mergeTags([], [7, null, "MCP"] as unknown as string[])).toEqual(["MCP"]);
    expect(mergeTags([], null as unknown as string[])).toEqual([]);
  });

  it("결과 순서는 태그 목록 순서다 (같은 입력에 항상 같은 출력)", () => {
    const a = mergeTags(["툴", "모델"], ["MCP"]);
    const b = mergeTags(["MCP"], ["모델", "툴"]);
    expect(a).toEqual(b);
    expect(a).toEqual(ARTICLE_TAGS.filter((t) => a.includes(t)));
  });
});
