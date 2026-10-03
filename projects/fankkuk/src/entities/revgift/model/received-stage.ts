import type { ReceivedRevgift } from "./revgift-rows";

// 받은 역조공 한 줄이 팬 본인 화면에서 어느 단계인지 정한다. 누가 받았는지·기한·출고·반송·취소는 DB 가 정한 값이고,
// 여기서는 그 값들 사이의 우선순위만 정한다. 팬 본인에게는 거절과 기한 지남을 나눠 보여 준다(reverse-gift INV-R8).

export type ReceivedStage = "waiting" | "accepted" | "shipped" | "declined" | "expired" | "returned" | "cancelled";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 우선순위: 거절·기한 지남 > 취소 > 반송 > 출고 > 기한 지난 기다림(→ 기한 지남) > 답한 그대로.
 * 기한 처리가 아직 돌지 않았어도 기한 시각이 된(같거나 지난) 「기다리는 중」은 기한 지남이다.
 */
export function receivedStage(r: Pick<ReceivedRevgift, "reply" | "shipped" | "returned" | "cancelled" | "deadline">, nowMs: number): ReceivedStage {
  if (r.reply === "declined" || r.reply === "expired") return r.reply;
  if (r.cancelled) return "cancelled";
  if (r.returned) return "returned";
  if (r.shipped) return "shipped";
  if (r.reply === "waiting" && Date.parse(r.deadline) <= nowMs) return "expired";
  return r.reply;
}

/** 남은 날(올림). 하루가 안 남았으면 1. */
export function daysLeft(deadline: string, nowMs: number): number {
  return Math.max(1, Math.ceil((Date.parse(deadline) - nowMs) / DAY_MS));
}

/** 진행 중 탭에 들어가는 단계 — 나머지는 지난 것. */
export function isOngoingStage(stage: ReceivedStage): boolean {
  return stage === "waiting" || stage === "accepted" || stage === "shipped";
}
