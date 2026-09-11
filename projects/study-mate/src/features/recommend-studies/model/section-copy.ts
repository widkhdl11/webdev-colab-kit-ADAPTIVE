import type { RecommendOutcome } from "./pipeline";

export type SectionCopy = {
  readonly title: string;
  readonly sub: string;
};

/**
 * 추천 구역의 제목과 설명 (INV-G6).
 *
 * **규칙으로 채운 자리를 「추천」이라 부르지 않는다.** 가입 직후에는 근거가 없고, 근거 없이
 * 만든 순서에 「나에게 맞는」을 붙이면 없는 근거가 있는 것처럼 보인다 — 제품 원칙 5
 * (정직한 데모)가 걸리는 자리다. 모델을 못 썼을 때도 같은 문구를 쓴다: 화면에서 두 경우는
 * 같은 일이고, 다르게 적으면 사용자가 왜 달라졌는지 물을 데가 없다.
 *
 * 순수 함수로 빼 둔 이유는 검사 때문이다 — 화면을 그리지 않고도 문구를 판정할 수 있다.
 */
/**
 * 제목은 두 경우에 같다. 이 구역은 화면이 뜬 뒤에 채워지므로(INV-G5), 제목까지 바뀌면
 * 사용자 눈에 글자가 갈아 끼워지는 것이 보인다. 무엇을 보고 고른 순서인지는 설명 줄이
 * 말하고, 「추천」이라는 말도 거기서 갈린다.
 *
 * 제목 자체는 아무것도 주장하지 않는다 — 개인화됐다고도, 인기순이라고도 안 한다.
 */
const TITLE = "이런 스터디는 어떠세요";

export function sectionCopy(kind: RecommendOutcome["kind"]): SectionCopy {
  if (kind === "model") {
    return {
      title: TITLE,
      sub: "관심 분야와 그동안 누른 좋아요·신청 기록을 보고 추천했습니다.",
    };
  }
  return {
    title: TITLE,
    sub: "좋아요가 많고 최근에 열린 순서입니다.",
  };
}

/** 아직 못 정했을 때 설명 줄에 놓는 말. 채워지기 전에도 자리가 안 흔들리게 한다 */
export const PENDING_SUB = "고르는 중입니다.";
export const SECTION_TITLE = TITLE;
