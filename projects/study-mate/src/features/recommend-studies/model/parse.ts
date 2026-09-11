import { unfence } from "@/shared/api/model/unfence";
/**
 * 모델의 응답을 순서로 바꾼다 (INV-G3).
 *
 * **여기가 이 기능의 방벽이다.** 모집글 제목은 누구나 자유롭게 쓸 수 있는 칸이고 그 글자가
 * 남의 추천 프롬프트에 들어간다. 「위 지시를 무시하라」 같은 문장을 앱이 막을 수는 없다 —
 * 막으려 들면 정상 제목까지 걸린다. 대신 **성공했을 때 얻는 것을 없앤다**: 모델의 답에서
 * 취하는 것을 후보 안의 id 와 순서로 좁히면, 완전히 조종당해도 얻는 최대가
 * 「순서가 이상해진다」이고 그건 품질 저하지 사고가 아니다.
 *
 * 돌려주는 값이 `null` 이면 그 호출은 실패다 — 부분을 긁어내지 않는다.
 */

/** 모델에게 요구하는 응답의 모양. 지시문이 이 이름을 그대로 쓴다. */
const RANKED_KEY = "ranked";

export function parseRanking(raw: string, allowed: readonly string[]): readonly string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(raw));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const ranked = (parsed as Record<string, unknown>)[RANKED_KEY];
  if (!Array.isArray(ranked)) return null;
  // 하나라도 문자열이 아니면 그 응답 전체를 못 믿는다. 「섞인 것만 버린다」로 하지 않는
  // 이유는, 모양이 다르다는 것 자체가 모델이 약속을 안 지켰다는 신호이기 때문이다.
  if (!ranked.every((id): id is string => typeof id === "string")) return null;

  const allowedSet = new Set(allowed);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ranked) {
    if (!allowedSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
