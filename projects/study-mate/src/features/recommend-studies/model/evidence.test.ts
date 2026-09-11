import { describe, expect, it } from "vitest";
import { hasEvidence, type Evidence } from "./evidence";

// 스펙: docs/specs/ai-assist.md — INV-G6
//
// 「근거가 비었다」의 정의는 스펙이 못 박았다: 관심 분야와 지역이 둘 다 비고, 좋아요가
// 0건이고, 신청 이력이 0건인 상태. **넷 중 하나라도 있으면 비지 않은 것이다.**

const EMPTY: Evidence = {
  interestCategoryId: null,
  regionCode: null,
  likedTitles: [],
  appliedStudyTitles: [],
};

describe("INV-G6: 근거가 하나도 없으면 모델을 안 부른다", () => {
  it("INV-G6 (실패경로): 넷이 다 비면 근거가 없다", () => {
    expect(hasEvidence(EMPTY)).toBe(false);
  });

  // 아래 넷은 「반대 절반」이다. 하나씩 채워 보지 않으면 판정 함수가 늘 false 를
  // 돌려줘도 위 검사 하나는 통과한다.
  it("INV-G6: 관심 분야만 있어도 근거가 있다", () => {
    expect(hasEvidence({ ...EMPTY, interestCategoryId: "it" })).toBe(true);
  });

  it("INV-G6: 지역만 있어도 근거가 있다", () => {
    expect(hasEvidence({ ...EMPTY, regionCode: "seoul" })).toBe(true);
  });

  it("INV-G6: 좋아요만 있어도 근거가 있다", () => {
    expect(hasEvidence({ ...EMPTY, likedTitles: ["토익 900 목표 새벽반"] })).toBe(true);
  });

  it("INV-G6: 신청 이력만 있어도 근거가 있다", () => {
    expect(hasEvidence({ ...EMPTY, appliedStudyTitles: ["정처기 실기 2주 완성"] })).toBe(true);
  });

  it("INV-G6 (실패경로): 빈 문자열은 값이 아니다", () => {
    // 프로필 칸을 열었다 지우면 빈 문자열이 남을 수 있다. 그건 「채웠다」가 아니다.
    expect(hasEvidence({ ...EMPTY, interestCategoryId: "", regionCode: "  " })).toBe(false);
  });
});
