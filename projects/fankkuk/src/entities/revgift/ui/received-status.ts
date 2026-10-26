import { formatDateTime } from "@/shared/lib/format/datetime";
import { daysLeft, type ReceivedStage } from "../model/received-stage";
import type { SentRevgift } from "../model/revgift-rows";
import type { StatusTone } from "@/shared/ui/status-tone";

// 역조공 상태를 화면 말로 옮긴다. 단계 판정은 model/received-stage.ts 가 하고, 여기서는 문구만 고른다.
// 팬 본인에게는 거절과 기한 지남을 나눠 보여 주고, 크리에이터에게는 세 가지뿐이다(reverse-gift INV-R8).

export type StageCopy = { tag: string; tone: StatusTone; note: string };

const STAGE_COPY: Record<Exclude<ReceivedStage, "waiting">, StageCopy> = {
  accepted: { tag: "수락", tone: "success", note: "수락 완료 · 배송 준비 중" },
  shipped: { tag: "출고됨", tone: "info", note: "배송 시작" },
  declined: { tag: "받지 않음", tone: "danger", note: "수령 거절" },
  expired: { tag: "기한 지남", tone: "danger", note: "수락 기한(7일) 만료" },
  returned: { tag: "돌려보냈어요", tone: "danger", note: "크리에이터에게 반송 완료" },
  // 용어집 disposed 라벨 「처분」 · 문장은 dispose_due 행의 「상자를 처분해요」와 같은 말(office-workflow INV-W15)
  disposed: { tag: "처분", tone: "danger", note: "상자 처분 완료" },
  cancelled: { tag: "취소됐어요", tone: "plain", note: "선물 취소 완료" },
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

/** 목록 한 줄의 상태 말. 기다리는 중이면 「5일 남음 · 10.08까지」, 하루 이하면 urgent. */
export function receivedStageCopy(stage: ReceivedStage, deadline: string, nowMs: number): StageCopy & { urgent: boolean } {
  if (stage !== "waiting") return { ...settledStageCopy(stage), urgent: false };
  const days = daysLeft(deadline, nowMs);
  return { tag: "받을지 정해 주세요", tone: "warn", note: `${days}일 남음 · ${monthDay(deadline)}까지`, urgent: days <= 1 };
}

/** 받기 화면의 기한 한 줄 — 「수락 기한: 10월 8일 오후 3:00」 */
export function replyDeadlineText(deadline: string): string {
  return `수락 기한: ${formatDateTime(deadline)}`;
}

const SENT_TAG: Record<SentRevgift["state"], { tag: string; tone: StatusTone }> = {
  waiting: { tag: "수락 대기", tone: "warn" },
  accepted: { tag: "수락", tone: "success" },
  not_received: { tag: "받지 않음", tone: "danger" },
};

/** 크리에이터에게 보이는 상태 배지 — 세 가지뿐(INV-R8). 라벨은 용어집 3·7절 크리에이터 화면 표기(수락 대기·수락·받지 않음) */
export function sentStateTag(state: SentRevgift["state"]): { tag: string; tone: StatusTone } {
  return SENT_TAG[state];
}
