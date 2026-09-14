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

/**
 * 어느 갈래로 갔는지 개발 중에만 한 줄 찍는다.
 *
 * **화면 문구는 그대로 둔다.** 규칙 순서로 떨어지는 길이 넷인데 화면은 둘로만 갈리고,
 * 그렇게 덮는 것은 의도다 — 사용자에게 내부 사정을 안 보인다(`model/section-copy.ts`).
 * 문제는 **만드는 사람도 못 갈랐다**는 것이다: 2026-09-11 에 「AI 추천이 안 나온다」를
 * 쫓느라 데이터베이스를 직접 뒤졌고, 실제 원인은 근거 0건이었는데 화면만 봐서는
 * 비로그인·후보 0건·모델 실패와 구별이 안 됐다.
 *
 * **판단을 다시 하지 않고 결과만 읽는다** — 여기서 갈래를 새로 계산하면 그 계산이
 * 파이프라인과 갈릴 수 있고, 그러면 로그가 실제로 일어난 일과 다른 말을 한다.
 *
 * **누가 요청했는지는 안 찍는다.** 갈래를 가르려는 것이지 사람을 보려는 것이 아니다.
 *
 * **로그가 결과를 못 바꾼다.** 찍다가 던지면 성공한 추천이 실패로 뒤집힌다 — 콘솔을 갈아
 * 끼운 실행(로그 수집기)에서 실제로 가능한 일이다(2026-09-14 security-reviewer).
 * 관찰하려고 넣은 줄이 관찰 대상을 망가뜨리는 모양이라 여기서 삼킨다.
 */
function logBranch(outcome: RecommendOutcome): void {
  if (process.env.NODE_ENV !== "development") return;
  try {
    const reason = outcome.reason === null ? "" : ` (${outcome.reason})`;
    console.info(`[recommend] ${outcome.kind}${reason} · 그린 것 ${outcome.posts.length}건`);
  } catch {
    // 삼킨다. 여기서 할 수 있는 것이 로그뿐인데 그 로그가 방금 실패했다.
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

  const outcome = await recommend(
    { userId: user?.id ?? null, evidence, candidates: posts },
    { model: geminiModel, reuse: recommendationReuse },
  );

  logBranch(outcome);
  return outcome;
}
