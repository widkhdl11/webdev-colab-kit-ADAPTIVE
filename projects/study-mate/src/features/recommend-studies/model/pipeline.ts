import type { PostSummary } from "@/entities/post";
import type { TextModel } from "@/shared/api/model/provider";
import { withTimeout } from "@/shared/lib/with-timeout";
import { hasEvidence, type Evidence } from "./evidence";
import { ruleOrder } from "./fallback";
import { MODEL_TIMEOUT_MS } from "./limits";
import { parseRanking } from "./parse";
import { buildPrompt } from "./prompt";
import type { ReuseStore } from "./reuse";

/**
 * 추천의 판단 전부. **데이터를 안 읽는다** — 근거와 후보는 이미 읽힌 채로 들어온다.
 *
 * 그렇게 나눈 이유는 검사 때문이다. 읽기가 섞여 있으면 「모델을 부르나 안 부르나」를 보려고
 * 데이터베이스를 세워야 하고, 그러면 이 판단들이 유닛에서 안 돈다.
 */
export type RecommendInput = {
  /** 비로그인이면 `null`. 이 값이 모델 호출의 문지기다 (INV-G4) */
  readonly userId: string | null;
  readonly evidence: Evidence;
  /** 요청자의 세션으로 읽은 것. 못 보는 글은 애초에 여기 없다 (INV-G2 · G3) */
  readonly candidates: readonly PostSummary[];
};

export type RecommendOutcome = {
  /** `model` 이면 모델이 정한 순서, `rule` 이면 모델 없이 정한 순서 */
  readonly kind: "model" | "rule";
  /**
   * 왜 규칙으로 갔나. **화면은 이 값을 안 읽는다** — 문구를 가르는 것은 `kind` 다.
   * 여기 있는 이유는 로그와 검사다: 「규칙으로 떨어졌다」는 같은데 이유가 넷이라,
   * 어느 갈래를 지났는지 구별할 손잡이가 없으면 검사가 「모델을 안 불렀다」까지만 보고
   * 왜 안 불렀는지는 못 가른다. 화면이 이유별로 다른 말을 하게 되는 날 여기서 가져간다.
   */
  readonly reason: "anonymous" | "no-evidence" | "no-candidates" | "model-unavailable" | null;
  readonly posts: readonly PostSummary[];
};

export type RecommendDeps = {
  readonly model: TextModel;
  readonly reuse: ReuseStore;
  readonly timeoutMs?: number;
};

const rule = (
  reason: NonNullable<RecommendOutcome["reason"]>,
  candidates: readonly PostSummary[],
): RecommendOutcome => ({ kind: "rule", reason, posts: ruleOrder(candidates) });

/** 순서(id 목록)를 후보에서 실제 값으로 바꾼다. 없는 id 는 조용히 빠진다 */
function pick(ranking: readonly string[], candidates: readonly PostSummary[]): PostSummary[] {
  const byId = new Map(candidates.map((post) => [post.id, post]));
  return ranking.flatMap((id) => {
    const hit = byId.get(id);
    return hit === undefined ? [] : [hit];
  });
}

export async function recommend(
  input: RecommendInput,
  deps: RecommendDeps,
): Promise<RecommendOutcome> {
  const { userId, evidence, candidates } = input;

  // ① 문지기 (INV-G4). 홈은 보호 경로가 아니므로 이 판정을 화면 접근 제어에 못 기댄다 —
  //    여기서 안 막으면 로그인 없이 누구나 우리 키로 모델을 부르는 창구가 된다.
  if (userId === null) return rule("anonymous", candidates);

  // ② 후보가 없으면 고를 것이 없다. 모델을 부르면 지어내는 것 말고 할 일이 없다.
  if (candidates.length === 0) return { kind: "rule", reason: "no-candidates", posts: [] };

  // ③ 근거가 없으면 안 부른다 (INV-G6).
  if (!hasEvidence(evidence)) return rule("no-evidence", candidates);

  // ④ 재사용 (INV-G7). 담긴 것은 순서뿐이라, 값은 이번에 들어온 후보에서 나온다 —
  //    제목이 바뀌었으면 바뀐 제목이 그려지고 사라진 글은 빠진다.
  // **담긴 것이 있으면 그 창에서는 모델을 다시 안 부른다 — 담긴 것이 빈 순서여도 그렇다.**
  // 처음엔 「빈 순서면 다시 부른다」로 짰는데, 그러면 모델이 아플 때 제한이 사라진다:
  // 실패한 호출은 아무것도 안 담으므로 다음 요청이 또 부르고, 매번 상한 시간을 기다린다.
  // **제공자가 아픈 바로 그때 가장 세게 부르는 모양**이었다(2026-09-10 code-reviewer).
  // 그래서 실패도 「이 창에서 시도했다」로 담고(아래 ⑥), 여기서는 담긴 것이 있으면 끝낸다.
  const reused = deps.reuse.get(userId);
  if (reused !== null) {
    const posts = pick(reused, candidates);
    return posts.length > 0
      ? { kind: "model", reason: null, posts }
      : rule("model-unavailable", candidates);
  }

  // ⑤ 모델. 실패·지연·모양 위반은 전부 한 갈래로 떨어진다 (INV-G5).
  let ranking: readonly string[] | null = null;
  try {
    const prompt = buildPrompt(evidence, candidates);
    // **상한을 쥐는 곳이 여기다.** 제공자 구현에 맡기면 신호를 안 보는 구현 하나가 홈
    // 전체를 멈춰 세운다 — 처음엔 그렇게 짰고 검사에서 걸렸다. 신호는 같이 내려보내
    // 제공자가 붙잡고 있던 연결을 실제로 놓게 한다.
    const raw = await withTimeout(
      (signal) =>
        deps.model.generate({
          instruction: prompt.instruction,
          data: prompt.data,
          signal,
          expectJson: true,
        }),
      deps.timeoutMs ?? MODEL_TIMEOUT_MS,
    );
    ranking = parseRanking(raw, candidates.map((post) => post.id));
  } catch (cause) {
    // 원문을 화면으로 안 보낸다. 여기 담기는 것에는 프롬프트 조각이 섞일 수 있다.
    console.warn("[recommend] 모델을 못 써서 규칙 순서로 떨어진다", cause);
    ranking = null;
  }

  // ⑥ **결과가 어떻든 「이 창에서 시도했다」를 담는다.** 실패도 담는 이유는 위 ④에 적었다 —
  //    안 담으면 제공자가 아픈 동안 매 요청이 호출 한 번씩이 된다.
  //    담기는 것은 여전히 **모델이 정한 순서**뿐이고(실패면 빈 순서), 규칙 순서는 절대 안 담는다.
  //    규칙 순서를 담으면 근거가 생긴 뒤에도 그 창 동안 규칙 결과가 그대로 나온다.
  deps.reuse.set(userId, ranking ?? []);

  // 빈 순서는 규칙으로 떨어뜨린다 — 구역을 빈 채로 그리는 것보다 낫고,
  // 「모델이 고를 것이 없다고 했다」와 「모델을 못 썼다」는 화면에서 같은 일이다.
  if (ranking === null || ranking.length === 0) return rule("model-unavailable", candidates);
  return { kind: "model", reason: null, posts: pick(ranking, candidates) };
}
