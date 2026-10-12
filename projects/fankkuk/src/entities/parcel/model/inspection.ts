import { z } from "zod";

// 검수 기록 (office-workflow INV-W4). 팬 선물 = 블루투스·RF·금속, 역조공 = 겉면·금지 물품.
// 팬 선물에서 블루투스·RF 반응이 나오면 직원이 위치 추적기인지 판정한다(2026-10-12 문제집 D2):
// 「추적기」면 결론은 「추적기 반송」 하나(DB 값 hold — 보관 없이 바로 반송 대기), 「추적기 아님」이면 「크리에이터 확인」(DB 값 confirm —
// 크리에이터에게 받을지 묻고 168시간 안에 답이 없으면 반송, 2026-10-12 (2) D3 ②) 또는 반송. 바로 통과하지 않는다.
// 판정 값은 검수 기록에 남는다(tracker_verdict). 역조공에서 하나라도 걸리면 「반송」만.
// 같은 규칙을 DB 기록 함수가 다시 확인한다 — 여기는 화면 선택지와 서버 1차 검사용.

export type CheckMark = "clear" | "found";
/** 결론. hold = 추적기 반송(값 이름은 환불·취소 함수가 읽는 DB 값 그대로) · confirm = 크리에이터 확인 */
export type InspectionOutcome = "pass" | "return" | "hold" | "confirm";
export type TrackerVerdict = "tracker" | "not_tracker";

export type GiftChecks = { kind: "gift"; bluetooth: CheckMark; rf: CheckMark; metal: CheckMark; trackerVerdict: TrackerVerdict | null };
export type RevgiftChecks = { kind: "revgift"; surface: CheckMark; prohibited: CheckMark };
export type InspectionChecks = GiftChecks | RevgiftChecks;

/** 블루투스·RF 중 하나라도 반응했는가 — 그러면 추적기 판정이 필요하다 */
export function trackerReacted(checks: Pick<GiftChecks, "bluetooth" | "rf">): boolean {
  return checks.bluetooth === "found" || checks.rf === "found";
}

/** 반응이 없어진 팬 선물의 남은 추적기 판정을 비운다 — 다시 반응이 나오면 판정은 기본값 없이 비어 있어야 한다 */
export function withoutStaleVerdict(checks: InspectionChecks): InspectionChecks {
  return checks.kind === "gift" && !trackerReacted(checks) && checks.trackerVerdict !== null ? { ...checks, trackerVerdict: null } : checks;
}

export function allowedOutcomes(checks: InspectionChecks): readonly InspectionOutcome[] {
  if (checks.kind === "gift") {
    if (!trackerReacted(checks)) return ["pass", "return"];
    if (checks.trackerVerdict === "tracker") return ["hold"];
    if (checks.trackerVerdict === "not_tracker") return ["confirm", "return"];
    return [];
  }
  return checks.surface === "found" || checks.prohibited === "found" ? ["return"] : ["pass", "return"];
}

const mark = z.enum(["clear", "found"]);

const giftResult = z
  .object({
    bluetooth: mark,
    rf: mark,
    metal: mark,
    tracker_verdict: z.enum(["tracker", "not_tracker"]).optional(),
    outcome: z.enum(["pass", "return", "hold", "confirm"]),
  })
  .strict()
  // 반응 있음 ⇔ 판정 있음, 그리고 결론이 판정과 맞아야 한다
  .refine((r) => trackerReacted(r) === (r.tracker_verdict !== undefined))
  .refine((r) => allowedOutcomes({ kind: "gift", bluetooth: r.bluetooth, rf: r.rf, metal: r.metal, trackerVerdict: r.tracker_verdict ?? null }).includes(r.outcome));

const revgiftResult = z
  .object({ surface: mark, prohibited: mark, outcome: z.enum(["pass", "return"]) })
  .strict()
  .refine((r) => allowedOutcomes({ kind: "revgift", ...r }).includes(r.outcome));

/** DB 에 넘기는 검수 결과(p_result). 결론이 검사 결과·판정과 맞아야 한다. */
export const inspectionResultShape = z.union([giftResult, revgiftResult]);
export type InspectionResult = z.infer<typeof inspectionResultShape>;

/**
 * 화면이 고른 결론으로 DB 에 보낼 기록을 만든다. 허용 밖이면(예: 역조공에 추적기 반송) 허용된 첫 결론으로 바꾼다.
 * 반응이 있는데 아직 추적기 판정을 하지 않았으면 보낼 기록이 없다(null).
 */
export function inspectionResultOf(checks: InspectionChecks, chosen: InspectionOutcome): InspectionResult | null {
  const allowed = allowedOutcomes(checks);
  const outcome = allowed.includes(chosen) ? chosen : allowed[0];
  if (outcome === undefined) return null;
  if (checks.kind === "gift") {
    const base = { bluetooth: checks.bluetooth, rf: checks.rf, metal: checks.metal };
    // 반응이 없어진 뒤 남은 판정은 싣지 않는다
    return trackerReacted(checks) && checks.trackerVerdict ? { ...base, tracker_verdict: checks.trackerVerdict, outcome } : { ...base, outcome };
  }
  return { surface: checks.surface, prohibited: checks.prohibited, outcome: outcome === "pass" ? "pass" : "return" };
}

/** 결론 선택지 제한 — 화면 경고 문구용. 추적기 → 추적기 반송만, 추적기 아님 → 크리에이터 확인·반송, 판정 전 → 판정부터, 역조공 걸림 → 반송만. */
export function outcomeRestriction(checks: InspectionChecks): "tracker_only" | "creator_confirm" | "needs_verdict" | "return_only" | null {
  const allowed = allowedOutcomes(checks);
  if (allowed.length === 0) return "needs_verdict";
  if (allowed.includes("confirm")) return "creator_confirm";
  if (allowed.length !== 1) return null;
  return allowed[0] === "hold" ? "tracker_only" : "return_only";
}
