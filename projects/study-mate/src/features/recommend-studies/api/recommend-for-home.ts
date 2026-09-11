import { readPosts } from "@/entities/post";
import { currentUser } from "@/entities/session";
import { geminiModel } from "@/shared/api/model/gemini";
import { CANDIDATE_MAX } from "../model/limits";
import { recommend, type RecommendOutcome } from "../model/pipeline";
import { recommendationReuse } from "../model/reuse";
import { readEvidence } from "./read-evidence";

/**
 * 홈의 추천 구역이 쓰는 한 줄. **배선만 한다** — 판단은 전부 `model/pipeline.ts` 에 있다.
 *
 * 후보는 모집 중인 모집글을 최신순으로 상한만큼 읽는다. `readPosts` 를 그대로 쓰는 이유는
 * 그 질의가 이미 「스터디마다 최근 한 장」과 접근 정책을 다 지나고 있어서다 — 여기서 질의를
 * 새로 쓰면 그 규칙 두 개가 두 벌이 된다.
 */
/**
 * 후보를 읽는다. **읽다 실패하면 던지지 않고 빈 목록을 돌려준다** (INV-G5).
 *
 * `readPosts` 는 조회가 실패하면 던진다 — 목록 화면에서는 그것이 맞다(빈 목록과 고장을
 * 구별해야 한다). 그런데 추천은 곁다리라, 그 던짐이 홈 전체를 죽이면 「AI 는 거들 뿐」이
 * 문장으로만 남는다. 화면 쪽 오류 경계가 뒤를 받치지만 여기서 먼저 막는 편이 낫다 —
 * 그러면 구역이 사라지는 대신 규칙 순서로라도 채워진다.
 */
async function readCandidates() {
  try {
    const { posts } = await readPosts({ openOnly: true, perPage: CANDIDATE_MAX, sort: "latest" });
    return posts;
  } catch (cause) {
    console.warn("[recommend] 후보를 못 읽어 구역을 비운다", cause);
    return [];
  }
}

export async function recommendForHome(): Promise<RecommendOutcome> {
  const user = await currentUser();

  const [posts, evidence] = await Promise.all([
    readCandidates(),
    // 비로그인이면 근거를 안 읽는다 — 읽을 것도 없고, 안 읽는 것이 한 왕복 싸다.
    user === null
      ? Promise.resolve({
          interestCategoryId: null,
          regionCode: null,
          likedTitles: [],
          appliedStudyTitles: [],
        })
      : readEvidence(user.id),
  ]);

  return recommend(
    { userId: user?.id ?? null, evidence, candidates: posts },
    { model: geminiModel, reuse: recommendationReuse },
  );
}
