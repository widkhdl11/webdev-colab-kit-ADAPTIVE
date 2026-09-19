import { avgPerItem } from "./avg-per-item";

/** 소스 하나의 "글당 평균 사용 토큰" — 그 소스가 쓴 토큰 합계를 검색 글 수로 나눈다. */
export function avgTokensPerItem(tokensUsed: number, fetched: number): number | null {
  return avgPerItem(tokensUsed, fetched);
}
