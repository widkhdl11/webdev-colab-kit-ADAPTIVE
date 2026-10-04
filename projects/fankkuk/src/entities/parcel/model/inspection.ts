import { z } from "zod";

// 검수 기록 (office-workflow INV-W4). 팬 선물 = 블루투스·RF·금속, 역조공 = 겉면·금지 물품.
// 팬 선물에서 추적 장치(블루투스·RF)가 나오면 반송하지 않고 「보관」만(보관은 그때만 있다).
// 역조공에서 하나라도 걸리면 「반송」만. 같은 규칙을 DB 기록 함수가 다시 확인한다 — 여기는 화면 선택지와 서버 1차 검사용.

export type CheckMark = "clear" | "found";
export type InspectionOutcome = "pass" | "return" | "hold";

export type GiftChecks = { kind: "gift"; bluetooth: CheckMark; rf: CheckMark; metal: CheckMark };
export type RevgiftChecks = { kind: "revgift"; surface: CheckMark; prohibited: CheckMark };
export type InspectionChecks = GiftChecks | RevgiftChecks;

export function allowedOutcomes(checks: InspectionChecks): readonly InspectionOutcome[] {
  if (checks.kind === "gift") {
    const tracker = checks.bluetooth === "found" || checks.rf === "found";
    return tracker ? ["hold"] : ["pass", "return"];
  }
  return checks.surface === "found" || checks.prohibited === "found" ? ["return"] : ["pass", "return"];
}

const mark = z.enum(["clear", "found"]);

const giftResult = z
  .object({ bluetooth: mark, rf: mark, metal: mark, outcome: z.enum(["pass", "return", "hold"]) })
  .strict()
  .refine((r) => allowedOutcomes({ kind: "gift", ...r }).includes(r.outcome));

const revgiftResult = z
  .object({ surface: mark, prohibited: mark, outcome: z.enum(["pass", "return"]) })
  .strict()
  .refine((r) => allowedOutcomes({ kind: "revgift", ...r }).includes(r.outcome));

/** DB 에 넘기는 검수 결과(p_result). 결론이 검사 결과와 맞아야 한다. */
export const inspectionResultShape = z.union([giftResult, revgiftResult]);
export type InspectionResult = z.infer<typeof inspectionResultShape>;

/** 화면이 고른 결론으로 DB 에 보낼 기록을 만든다. 허용 밖이면(예: 역조공에 보관) 허용된 첫 결론으로 바꾼다. */
export function inspectionResultOf(checks: InspectionChecks, chosen: InspectionOutcome): InspectionResult {
  const allowed = allowedOutcomes(checks);
  const outcome = allowed.includes(chosen) ? chosen : (allowed[0] ?? "return");
  if (checks.kind === "gift") return { bluetooth: checks.bluetooth, rf: checks.rf, metal: checks.metal, outcome };
  return { surface: checks.surface, prohibited: checks.prohibited, outcome: outcome === "pass" ? "pass" : "return" };
}

/** 결론 선택지가 하나로 묶였는가 — 화면 경고 문구용. */
export function outcomeRestriction(checks: InspectionChecks): "hold_only" | "return_only" | null {
  const allowed = allowedOutcomes(checks);
  if (allowed.length !== 1) return null;
  return allowed[0] === "hold" ? "hold_only" : "return_only";
}
