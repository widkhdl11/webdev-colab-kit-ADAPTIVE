import { describe, expect, it } from "vitest";
import { SOURCES, UNKNOWN_SOURCE_WEIGHT } from "../model/sources";
import { getSourceWeight, sourceWeightLookup } from "./weight";

/**
 * INV-R4 (ingestion-ranking): weight 는 소스(설정파일)에 귀속하며 항목에 스냅샷 저장하지 않는다.
 * 여기서는 "설정에서 읽어 온다"는 쪽을 잡고, "항목에 안 박힌다"는 rank-feed 쪽에서 잡는다.
 */
describe("getSourceWeight — INV-R4 weight 는 소스에 귀속한다", () => {
  it("INV-R4: 설정파일의 weight 를 그대로 읽는다", () => {
    for (const source of SOURCES) {
      expect(getSourceWeight(source.id)).toBe(source.weight);
    }
    // 소스가 전부 같은 값이면 위 단언이 아무것도 증명하지 못한다.
    expect(new Set(SOURCES.map((s) => s.weight)).size).toBeGreaterThan(1);
  });

  it("INV-R4: 설정을 바꾸면 항목을 안 건드려도 조회값이 따라온다", () => {
    const edited = SOURCES.map((s) =>
      s.id === "hn-frontpage" ? { ...s, weight: 9 } : s,
    );
    expect(sourceWeightLookup(edited)("hn-frontpage")).toBe(9);
    // 원본 설정은 그대로 — 조회 함수가 설정을 붙들고 있지 않다는 뜻.
    expect(getSourceWeight("hn-frontpage")).toBe(1);
  });

  describe("실패 경로", () => {
    it("INV-R4 실패경로: 모르는 소스는 0 이 아니라 기본 배수를 준다", () => {
      // 0 을 주면 그 소스의 글이 점수 0 이 되어 피드에서 통째로 사라진다.
      // 설정에서 소스 id 하나를 오타 낸 것이 "글이 아예 안 보인다"로 나타나면 원인을 못 찾는다.
      expect(getSourceWeight("없는-소스")).toBe(UNKNOWN_SOURCE_WEIGHT);
      expect(UNKNOWN_SOURCE_WEIGHT).toBeGreaterThan(0);
    });

    it("INV-R4 실패경로: 빈 문자열도 같은 취급", () => {
      expect(getSourceWeight("")).toBe(UNKNOWN_SOURCE_WEIGHT);
    });
  });
});
