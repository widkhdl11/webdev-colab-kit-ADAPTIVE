import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { Evidence } from "../model/evidence";
import { appliedTitlesQuery, likedTitlesQuery, profileEvidenceQuery } from "./evidence-query";

/**
 * 추천의 근거 셋을 읽는다 (INV-G2).
 *
 * **전부 요청자 본인의 것이다.** 그래서 요청자의 세션으로 다 읽힌다 — 정책을 우회하는
 * 키가 필요한 자리가 없다. 이 파일이 `createServerSupabase()` 말고 다른 연결을 쓰게 되는
 * 날이 `write-authorization.md` 의 전제가 깨지는 날이다.
 *
 * **`userId` 를 받지만 셋 중 둘은 정책이 안 막는다.** 처음엔 「남의 id 를 넣어도 정책이
 * 판정하므로 안 보이는 것은 안 온다」고 적었는데 사실이 아니었다(2026-09-10 code-reviewer).
 * 좋아요는 누구나 읽고(`likes_read` 는 `using (true)`), 프로필은 관계로 갈리므로
 * 내 스터디에 신청한 사람의 관심 분야는 나에게 보인다. 남의 것이 안 오는 것은
 * `participants` 하나뿐이다.
 *
 * **그래서 막는 것은 조건이 아니라 `userId` 의 출처다** — `draft-query.ts` 와 같은 모양이다.
 * 이 함수는 슬라이스 밖으로 안 내보내고, 부르는 자리는 `recommend-for-home.ts` 하나이며
 * 거기서 세션의 id 를 넣는다.
 *
 * 셋 중 둘은 **남이 쓴 글자**를 담아 온다(좋아요 누른 모집글 제목, 신청한 스터디 제목).
 * 그 값은 프롬프트의 데이터 자리에만 들어가고, 모델의 답은 값으로 안 믿는다 (INV-G3).
 *
 * 읽다가 실패하면 **던지지 않고 빈 근거를 돌려준다.** 근거가 없으면 규칙 순서로 떨어지고
 * (INV-G6) 홈은 그대로 뜬다 — 추천 하나 때문에 정문이 죽지 않는 것이 INV-G5 다.
 */
const EMPTY: Evidence = {
  interestCategoryId: null,
  regionCode: null,
  likedTitles: [],
  appliedStudyTitles: [],
};

/**
 * 임베드 한 칸에서 제목을 꺼낸다.
 *
 * **모양을 런타임에 본다.** PostgREST 의 임베드는 관계에 따라 객체로도 배열로도 오고,
 * 못 만든 키는 오류 없이 빠진 채 돌아온다 — 확인하지 않으면 `undefined` 가 제목 자리를
 * 지나 프롬프트에 빈 줄로 들어간다(`entities/post/api/read-my-posts.ts` 의 같은 판단).
 *
 * 여기서는 던지지 않고 버린다. 근거는 없어도 되는 값이다.
 */
export function titlesOf(rows: unknown, key: string): readonly string[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const embedded: unknown = (row as Record<string, unknown>)[key];
    const one: unknown = Array.isArray(embedded) ? embedded[0] : embedded;
    if (typeof one !== "object" || one === null) return [];
    const title: unknown = (one as Record<string, unknown>).title;
    return typeof title === "string" && title.trim() !== "" ? [title] : [];
  });
}

export async function readEvidence(userId: string): Promise<Evidence> {
  try {
    const db = await createServerSupabase();

    // 셋을 나란히 읽되 **하나가 죽어도 나머지는 쓴다**. `Promise.all` 이면 하나가 거부될 때
    // 전부를 버리고 빈 근거가 되는데, 그러면 관심 분야도 좋아요도 멀쩡한 사용자가
    // 「근거 없음」으로 판정돼(INV-G6) 모델을 아예 안 부르고 화면 문구까지 바뀐다.
    // 잃는 것이 「추천 품질 저하」가 아니라 「추천이 다른 화면이 됨」이었다
    // (2026-09-10 code-reviewer).
    const [profile, likes, participants] = await Promise.allSettled([
      profileEvidenceQuery(db, userId),
      likedTitlesQuery(db, userId),
      appliedTitlesQuery(db, userId),
    ]);
    const got = <T,>(r: PromiseSettledResult<{ data: T | null }>): T | null =>
      r.status === "fulfilled" ? r.value.data : null;

    const profileRow = got(profile);
    return {
      interestCategoryId: profileRow?.interest_category ?? null,
      regionCode: profileRow?.region ?? null,
      likedTitles: titlesOf(got(likes), "post"),
      appliedStudyTitles: titlesOf(got(participants), "study"),
    };
  } catch (cause) {
    console.warn("[recommend] 근거를 못 읽어 규칙 순서로 떨어진다", cause);
    return EMPTY;
  }
}
