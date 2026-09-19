import { describe, expect, it } from "vitest";
import { KEYWORD_EVIDENCE_LIMIT } from "./budgets";
import { keywordEvidence } from "./keyword-evidence";

/**
 * 이 파일이 생긴 이유(2026-08-31): `keywordEvidence` 가 `api/ports.ts` 안에 있었는데
 * 그 파일은 `server-only` 라 유닛이 로드조차 못 했다. 상한을 12로 바꾸든 두 재료의
 * 우선순위를 뒤집든 **전 스위트가 green** 이었다(rules/tdd.md "테스트가 못 읽는 자리").
 *
 * 입력에 상수를 쓰지 않는다 — 상수에서 파생한 입력은 그 상수를 못 붙든다.
 */
describe("keywordEvidence — 근거 고르기", () => {
  it("출처 요약글이 있으면 그것을 쓴다", () => {
    expect(keywordEvidence("출처 요약글", "<p>본문</p>")).toBe("출처 요약글");
  });

  it("요약글이 비어 있으면 본문으로 간다", () => {
    expect(keywordEvidence("", "<p>본문이다</p>")).toBe("본문이다");
  });

  it("요약글이 공백뿐이어도 본문으로 간다", () => {
    // `trim()` 없이 `||` 만 쓰면 `"   "` 가 참이라 공백을 근거로 실어 보낸다.
    expect(keywordEvidence("   \n  ", "<p>본문이다</p>")).toBe("본문이다");
  });

  it("우선순위가 뒤집히지 않는다 — 둘 다 있으면 본문을 안 쓴다", () => {
    expect(keywordEvidence("요약", "<p>본문</p>")).not.toContain("본문");
  });

  it("태그를 지우고 연속 공백을 접는다", () => {
    expect(keywordEvidence("", "<h1>제목</h1>\n\n<p>여러   칸</p>")).toBe("제목 여러 칸");
  });

  it("둘 다 없으면 빈 문자열 — 부르는 쪽이 '근거 없음'으로 건너뛸 수 있어야 한다", () => {
    expect(keywordEvidence("", "")).toBe("");
  });
});

describe("keywordEvidence — 상한 (KEYWORD_EVIDENCE_LIMIT)", () => {
  it("1,200자에서 자른다", () => {
    // 리터럴로 준다. `KEYWORD_EVIDENCE_LIMIT + 100` 으로 만들면 상수를 20만으로 바꿔도
    // 관계가 유지돼 통과한다 — 이 저장소에서 다섯 번 난 형태다.
    expect(keywordEvidence("가".repeat(1_300), "")).toHaveLength(1_200);
    expect(keywordEvidence("가".repeat(1_200), "")).toHaveLength(1_200);
    expect(keywordEvidence("가".repeat(1_199), "")).toHaveLength(1_199);
  });

  it("본문 쪽에도 같은 상한이 걸린다", () => {
    expect(keywordEvidence("", `<p>${"나".repeat(5_000)}</p>`)).toHaveLength(1_200);
  });

  it("상수 자체를 못 박는다 — 값을 바꾸면 비용이 통째로 달라진다", () => {
    // VentureBeat 처럼 요약글에 본문을 통째로 주는 소스(실측 16,000자)가 있어서,
    // 이 값이 곧 그 소스 한 곳이 쓰는 비용이다.
    expect(KEYWORD_EVIDENCE_LIMIT).toBe(1_200);
  });
});
