import { formatDateTime } from "@/shared/lib/format/datetime";
import type { ReceivedRevgift, SentRevgift } from "../model/revgift-rows";

// 역조공 상태를 화면 말로 옮긴다. 판정(누가 받았는지·기한)은 DB 가 한 값이고, 여기서는 그 값을 고르고 적기만 한다.
// 팬 본인에게는 거절과 기한 지남을 나눠 보여 주고, 크리에이터에게는 세 가지뿐이다(reverse-gift INV-R8).

export type ReceivedStage = "waiting" | "accepted" | "shipped" | "declined" | "expired" | "returned";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 받은 역조공 한 줄의 단계. 기한 처리가 아직 돌지 않았어도 기한이 지난 「기다리는 중」은 기한 지남으로 보여 준다. */
export function receivedStage(r: Pick<ReceivedRevgift, "reply" | "shipped" | "returned" | "deadline">, nowMs: number): ReceivedStage {
  if (r.reply === "declined" || r.reply === "expired") return r.reply;
  if (r.returned) return "returned";
  if (r.shipped) return "shipped";
  if (r.reply === "waiting" && Date.parse(r.deadline) <= nowMs) return "expired";
  return r.reply;
}

export type StageCopy = { tag: string; brand: boolean; note: string };

const STAGE_COPY: Record<Exclude<ReceivedStage, "waiting">, StageCopy> = {
  accepted: { tag: "받았어요", brand: false, note: "상자가 준비되면 보내 드려요" },
  shipped: { tag: "출고됨", brand: true, note: "배송이 시작됐어요 · 주소는 지워졌어요" },
  declined: { tag: "받지 않았어요", brand: false, note: "내가 받지 않기를 눌렀어요" },
  expired: { tag: "받지 않았어요", brand: false, note: "기한(7일)이 지났어요" },
  returned: { tag: "돌려보냈어요", brand: false, note: "상자를 크리에이터에게 돌려보냈어요" },
};

const shortDate = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" });

function monthDay(iso: string): string {
  const parts = shortDate.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")}.${get("day")}`;
}

/** 정해진(기다리는 중이 아닌) 단계의 상태 말. */
export function settledStageCopy(stage: Exclude<ReceivedStage, "waiting">): StageCopy {
  return STAGE_COPY[stage];
}

/** 남은 날(올림). 하루가 안 남았으면 1. */
export function daysLeft(deadline: string, nowMs: number): number {
  return Math.max(1, Math.ceil((Date.parse(deadline) - nowMs) / DAY_MS));
}

/** 목록 한 줄의 상태 말. 기다리는 중이면 「5일 남음 · 10.08까지」, 하루 이하면 urgent. */
export function receivedStageCopy(stage: ReceivedStage, deadline: string, nowMs: number): StageCopy & { urgent: boolean } {
  if (stage !== "waiting") return { ...settledStageCopy(stage), urgent: false };
  const days = daysLeft(deadline, nowMs);
  return { tag: "받기 기다리는 중", brand: true, note: `${days}일 남음 · ${monthDay(deadline)}까지`, urgent: days <= 1 };
}

/** 받기 화면의 기한 한 줄 — 「10월 8일 오후 3:00까지 정해 주세요」 */
export function replyDeadlineText(deadline: string): string {
  return `${formatDateTime(deadline)}까지 정해 주세요`;
}

/** 진행 중 탭에 들어가는 단계 — 나머지는 지난 것. */
export function isOngoingStage(stage: ReceivedStage): boolean {
  return stage === "waiting" || stage === "accepted" || stage === "shipped";
}

const SENT_TAG: Record<SentRevgift["state"], { tag: string; brand: boolean }> = {
  waiting: { tag: "기다리는 중", brand: false },
  accepted: { tag: "받았어요", brand: true },
  not_received: { tag: "받지 않았어요", brand: false },
};

/** 크리에이터에게 보이는 상태 배지 — 세 가지뿐(INV-R8). */
export function sentStateTag(state: SentRevgift["state"]): { tag: string; brand: boolean } {
  return SENT_TAG[state];
}

const TIER_NAME: Record<ReceivedRevgift["tier"], string> = { small: "소형", medium: "중형", large: "대형" };

export function revgiftTierName(tier: ReceivedRevgift["tier"]): string {
  return TIER_NAME[tier];
}
