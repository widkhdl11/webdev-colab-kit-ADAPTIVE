/**
 * 추천이 읽는 근거 셋 (`docs/DECISIONS.md` 2026-09-10 — 사용자 결정).
 *
 * 넷으로 보이지만 셋이다: 프로필에서 둘(관심 분야·지역), 좋아요에서 하나, 신청 이력에서
 * 하나. **전부 요청자 본인의 것**이라 요청자의 세션만으로 다 읽힌다 — 정책을 우회하는
 * 키가 필요한 자리가 없다 (INV-G2).
 */
export type Evidence = {
  readonly interestCategoryId: string | null;
  readonly regionCode: string | null;
  /** 좋아요 누른 모집글의 제목. **남이 쓴 글자다** — 프롬프트에서 데이터 자리에만 들어간다 */
  readonly likedTitles: readonly string[];
  /** 신청한 스터디의 제목. 위와 같다 */
  readonly appliedStudyTitles: readonly string[];
};

const filled = (v: string | null): boolean => v !== null && v.trim() !== "";

/**
 * 근거가 하나라도 있는가 (INV-G6).
 *
 * 없으면 모델을 부르지 않는다. 부를 수는 있지만 그때 모델이 할 수 있는 일은 지어내는
 * 것뿐이고, 그 결과에 「추천」이라는 이름을 붙이면 없는 근거가 있는 것처럼 보인다.
 *
 * 빈 문자열을 값으로 안 치는 이유: 프로필 칸을 열었다 지우면 빈 문자열이 남을 수 있다.
 */
export function hasEvidence(evidence: Evidence): boolean {
  return (
    filled(evidence.interestCategoryId) ||
    filled(evidence.regionCode) ||
    evidence.likedTitles.length > 0 ||
    evidence.appliedStudyTitles.length > 0
  );
}
