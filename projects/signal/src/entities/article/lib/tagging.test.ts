import { describe, expect, it } from "vitest";
import { normalizeTagName } from "./tagging";

/**
 * INV-T2·B2: `normalized_name` 이 DB 유일성을 판정하는 값이다.
 * 여기서 합쳐지지 않으면 같은 뜻이 여러 행으로 갈리고, 뱃지 줄이 쪼개진다 —
 * "프론트엔드 3건"이 되어야 할 것이 "프론트엔드 1 / 웹 프론트엔드 1 / 프론트엔드 개발 1".
 */
describe("normalizeTagName — INV-T2·B2 표기 정규화", () => {
  it("기존 태그 5개는 값이 안 바뀐다", () => {
    // 이미 DB 에 `normalized_name` 이 저장된 행이 있다. 여기가 바뀌면 조회가 그 행을
    // 못 찾아 같은 뜻이 두 행으로 갈린다. 값을 리터럴로 적는다 — 상수에서 파생시키면
    // 상수를 바꿔도 통과해 아무것도 안 붙든다.
    expect(["모델", "에이전트", "MCP", "엔지니어링", "툴"].map(normalizeTagName)).toEqual([
      "모델",
      "에이전트",
      "mcp",
      "엔지니어링",
      "툴",
    ]);
  });

  it("대소문자를 합친다", () => {
    expect(normalizeTagName("MCP")).toBe(normalizeTagName("mcp"));
  });

  it("양끝 공백과 연속 공백을 합친다", () => {
    // 모델 출력에 두 칸이 섞여 오는 일이 실제로 있다.
    expect(normalizeTagName("  AI  모델 ")).toBe("ai 모델");
  });

  it("하이픈·언더스코어를 공백으로 본다", () => {
    expect(normalizeTagName("온-디바이스 AI")).toBe(normalizeTagName("온 디바이스 AI"));
    expect(normalizeTagName("e-commerce")).toBe(normalizeTagName("e commerce"));
    expect(normalizeTagName("web_dev")).toBe(normalizeTagName("web dev"));
  });

  it("한글 조합형과 완성형을 합친다", () => {
    // 눈으로는 같은 글자인데 바이트가 다르다. 정규화가 없으면 "에이전트" 가 두 행으로 생긴다.
    const 완성형 = "에이전트";
    const 조합형 = 완성형.normalize("NFD");
    expect(조합형).not.toBe(완성형); // 전제 확인 — 같으면 이 테스트가 아무것도 안 본다
    expect(normalizeTagName(조합형)).toBe(normalizeTagName(완성형));
  });

  it("빈 값과 공백만 있는 값은 빈 문자열이 된다", () => {
    // 부르는 쪽(api/ports.ts)이 빈 문자열을 버리는 기준으로 쓴다.
    expect(normalizeTagName("   ")).toBe("");
    expect(normalizeTagName(" - _ ")).toBe("");
  });

  it("서로 다른 말은 합치지 않는다", () => {
    // 합치는 쪽으로만 확인하면 전부 빈 문자열로 만들어도 통과한다.
    expect(normalizeTagName("프론트엔드")).not.toBe(normalizeTagName("백엔드"));
    expect(normalizeTagName("웹 프론트엔드")).not.toBe(normalizeTagName("프론트엔드"));
  });
});
