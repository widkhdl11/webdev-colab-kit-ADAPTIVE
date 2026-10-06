import { postJson } from "@/shared/lib/http/post-json-client";

// 브라우저에서 알림을 지금 보낸다(/api/admin/work/notifications). 응답의 건수 꼴은 여기서 한 번 확인한다.

const FAILED = "알림을 보내지 못했어요. 잠시 뒤 다시 해 주세요.";

export type DispatchCountsView = { sent: number; skipped: number; retrying: number; failed: number; unfinished: number };
export type DispatchOutcome = { kind: "ok"; counts: DispatchCountsView } | { kind: "failed"; message: string };

export async function postDispatch(): Promise<DispatchOutcome> {
  const outcome = await postJson("/api/admin/work/notifications", {}, FAILED);
  if (outcome.kind === "failed") return { kind: "failed", message: outcome.message };
  const c = outcome.body.counts;
  if (typeof c !== "object" || c === null) return { kind: "failed", message: FAILED };
  const v = c as Record<string, unknown>;
  const keys = ["sent", "skipped", "retrying", "failed", "unfinished"] as const;
  if (keys.some((k) => typeof v[k] !== "number")) return { kind: "failed", message: FAILED };
  return { kind: "ok", counts: { sent: v.sent as number, skipped: v.skipped as number, retrying: v.retrying as number, failed: v.failed as number, unfinished: v.unfinished as number } };
}
