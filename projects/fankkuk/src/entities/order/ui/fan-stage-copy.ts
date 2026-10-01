import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { APPROVAL_DEADLINE_DAYS } from "../config/approval-deadline";
import type { FanGiftView, FanStep, FanStepKey } from "../model/fan-view";

// 팬 화면 문구와 "무엇을 보이나" 판단. 목록·상세·크리에이터 안내가 같은 말을 쓰게 한 자리에 둔다.

export const FAN_STEP_LABEL: Record<FanStepKey, string> = {
  registered: "등록",
  received: "입고",
  inspected: "검수",
  shipped: "출고",
  in_transit: "배송중",
  delivered: "수령",
};

/** 보내기 전에 알리는 거절 안내. 승인을 기다리지 않고 보내는 대신, 거절되면 반송하고 반송 택배비를 뺀다(결제 INV-M8). */
export const RETURN_ON_REJECT_NOTICE = `크리에이터가 받지 않기로 하거나 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면, 선물은 보낸 주소로 돌려보내 드리고 결제 금액에서 반송 택배비를 뺀 금액을 돌려드려요.`;

/** 거절·7일 자동 반려 때 팬이 보는 문구. 크리에이터의 거절 확인 창도 이 문구를 그대로 인용한다. */
/** 보내기 전에 알리는 검수 반송 안내. 추적 장치 등이 나오면 팬의 위반이라 검수비·반송비를 모두 뺀다(결제 INV-M8). */
export const RETURN_ON_INSPECTION_NOTICE =
  "검수에서 추적 장치처럼 보낼 수 없는 물품이 나오거나 상자가 중형보다 크면 돌려보내 드려요. 이때는 검수비와 반송 택배비를 빼서 돌려드리는 금액이 없어요.";

/** 본 단계 옆에 따로 붙는 승인 칸의 이름. */
export const APPROVAL_LABEL = "크리에이터 승인";

export const NOT_ACCEPTED_TEXT = "크리에이터가 이 선물을 받지 않아요";

const currentKey = (view: FanGiftView) => view.steps.find((st) => st.state === "current")?.key;

/** 지금 상황 한 줄. "지금 단계"는 아직 끝나지 않은 단계라, 그 단계를 기다리는 말로 쓴다. */
export function fanHeadline(view: FanGiftView): string {
  if (view.outcome === "not_accepted") return NOT_ACCEPTED_TEXT;
  if (view.outcome === "returned") return "검수에서 보낼 수 없는 물품이 확인돼 돌려보냈어요";
  if (view.outcome === "canceled") return "취소된 선물이에요";
  switch (currentKey(view)) {
    case "received":
      return view.fanTrackingNo ? "보내 주셨군요! 사무실 도착을 기다려요" : "사무실로 보내 주세요";
    case "inspected":
      return "사무실에 도착했어요. 검수하고 있어요";
    case "shipped":
      return view.approval.state === "done" ? "검수를 마쳤어요. 곧 출고해요" : "검수를 마쳤어요. 크리에이터의 승인을 기다려요";
    case "in_transit":
      return "출고했어요. 택배사가 곧 가져가요";
    case "delivered":
      return "크리에이터에게 가는 중이에요";
    default:
      return "크리에이터가 선물을 받았어요";
  }
}

/** 목록의 짧은 상태 표시. */
export function fanBadge(view: FanGiftView): { text: string; tone: "brand" | "plain" } {
  if (view.outcome === "not_accepted") return { text: "받지 않음", tone: "plain" };
  if (view.outcome === "returned") return { text: "반송", tone: "plain" };
  if (view.outcome === "canceled") return { text: "취소", tone: "plain" };
  const current = currentKey(view);
  if (!current) return { text: "수령 완료", tone: "brand" };
  if (current === "shipped" && view.approval.state !== "done") return { text: "승인 대기", tone: "plain" };
  if (current === "received") return { text: view.fanTrackingNo ? "도착 대기" : "보내 주세요", tone: "brand" };
  const lastDone = [...view.steps].reverse().find((st) => st.state === "done");
  return { text: lastDone ? FAN_STEP_LABEL[lastDone.key] : "등록", tone: "brand" };
}

/** 단계 아래 한 줄 설명. 없으면 null. */
export function fanStepDetail(step: FanStep, view: FanGiftView): string | null {
  const at = step.at ? formatDateTime(step.at) : null;
  if (step.state === "stopped") return at ? `${at} · 반송` : "반송";
  if (step.state === "current") {
    if (step.key === "shipped" && view.approval.state !== "done") return "승인되면 바로 출고하고 알림톡으로 알려 드려요";
    if (step.key === "received") return "도착하면 시각이 여기에 표시돼요";
    if (step.key === "inspected") return "모든 상자의 원래 송장을 떼고 겉면을 검사해요";
    return null;
  }
  if (step.state !== "done") return null;
  if (step.key === "shipped" && view.expectedArrivalDate) {
    return [at, `${formatDate(view.expectedArrivalDate)} 도착 예정`].filter(Boolean).join(" · ");
  }
  if (step.key === "inspected") return [at, "통과"].filter(Boolean).join(" · ");
  return at;
}

/** 진행 단계를 보일지. 거절·취소는 단계가 의미 없고, 반송은 어디서 멈췄는지 보인다. */
export function showsSteps(view: FanGiftView): boolean {
  return view.outcome === "in_progress" || view.outcome === "returned";
}

/** 출고가 끝났는지 — 크리에이터행 송장번호를 알려 주지 않는다는 안내를 이때부터 띄운다. */
export function hasShipped(view: FanGiftView): boolean {
  return view.steps.some((st) => st.key === "shipped" && st.state === "done");
}

export function fanProgress(view: FanGiftView): { done: number; total: number } {
  return { done: view.steps.filter((st) => st.state === "done").length, total: view.steps.length };
}

/** 헤더 선물 아이콘의 모양. 검수 뒤 승인 대기 = 모래시계(점선), 배송 완료 = 체크(초록 채움), 그 사이 = 트럭.
 *  진행이 끝난 선물(받지 않음·반송·취소)은 헤더에 띄우지 않는다 — null. */
export type HeaderGiftState = "wait" | "move" | "done";

export function headerGiftState(view: FanGiftView): HeaderGiftState | null {
  if (view.outcome !== "in_progress") return null;
  const current = currentKey(view);
  if (!current) return "done";
  if (view.approval.state === "waiting") return "wait";
  return "move";
}

/** 선물 목록의 묶음. 메인 「진행 중인 선물」과 선물 내역 탭이 같은 기준을 쓴다.
 *  헤더 아이콘(headerGiftState)은 수령한 선물도 잠시 보여 주므로 이것과 다르다. */
export type FanGiftBucket = "ongoing" | "ended" | "not_accepted";

export function fanGiftBucket(view: FanGiftView): FanGiftBucket {
  if (view.outcome === "not_accepted") return "not_accepted";
  if (view.outcome !== "in_progress") return "ended";
  return currentKey(view) ? "ongoing" : "ended";
}
