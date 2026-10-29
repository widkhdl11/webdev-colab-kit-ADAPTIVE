import { formatDate } from "@/shared/lib/format/datetime";
import type { StatusTone } from "@/shared/ui/status-tone";
import { APPROVAL_DEADLINE_DAYS } from "../config/approval-deadline";
import type { FanGiftView, FanStep, FanStepKey } from "../model/fan-view";

// 팬 화면 문구와 "무엇을 보이나" 판단. 목록·상세·크리에이터 안내가 같은 말을 쓰게 한 자리에 둔다.

export const FAN_STEP_LABEL: Record<FanStepKey, string> = {
  registered: "등록",
  received: "입고",
  inspected: "검수",
  shipped: "출고",
  in_transit: "배송 중",
  delivered: "수령",
};

/** 보내기 전에 알리는 거절 안내. 승인을 기다리지 않고 보내는 대신, 거절되면 반송하고 반송 택배비를 뺀다(결제 INV-M8). */
export const RETURN_ON_REJECT_NOTICE = `크리에이터가 거절하거나 결제 후 ${APPROVAL_DEADLINE_DAYS}일 안에 승인하지 않으면 선물 전달이 취소됩니다.\n도착한 상자는 확인한 반송 주소로 보내며, 해당 상자 금액에서 반송 배송비를 차감해 환불합니다. 아직 도착하지 않은 상자는 팬꾹 주소 확인 여부에 따라 환불 시점과 금액이 달라집니다.`;

/** 본 단계 옆에 따로 붙는 승인 칸의 이름. */
export const APPROVAL_LABEL = "크리에이터 승인";

/** 거절의 뜻 — 화면(C2)과 거절 알림(gift_undelivered, 2026-10-12 (2) D11)이 같은 말을 쓴다. 알림에는 크리에이터 이름을 넣지 않는다(notifications INV-N1). */
export const DECLINED_PHRASE = "선물 수령을 거절했습니다";

/** 거절(직접·차단 모두) — 부드럽게 말하되 거절했다는 뜻은 분명히(decline-block INV-D5, 2026-10-10 사용자 「"OO님이 선물을 원하지 않아요" 같은 대사로」). */
export function declinedText(creatorName: string): string {
  return `${creatorName}님이 ${DECLINED_PHRASE}`;
}

/** 7일 자동 반려 — 거절과 따로 보인다(decline-block INV-D5). */
export const EXPIRED_TEXT = "승인 기한이 지나 자동 반려되었습니다";

/** 추적기 보관·신고 보관·경찰 인계인 동안 팬에게 보이는 이름(office-workflow INV-W14) */
export const CHECKING_LABEL = "확인 중";

const currentKey = (view: FanGiftView) => view.steps.find((st) => st.state === "current")?.key;

/** 팬 화면 상태 배지. kind 는 승인 대기 배지에만 — 상세 화면이 이 배지를 이름 붙은 승인 대기 배지로 바꿔 끼울 때 알아본다(fanDetailBadges) */
export type FanBadge = { text: string; tone: StatusTone; kind?: "approval_wait" };

/** 승인 전 주문에서 「먼저 보내기」를 아직 누르지 않았을 때, 그리고 검수 뒤 승인만 기다릴 때의 상단 표시(approval-signature INV-S9) — 받는 주소가 아직 없으니 「보내 주세요」라고 하지 않는다. */
export const EARLY_SEND_WAIT_BADGE: FanBadge = { text: "승인 대기", tone: "warn", kind: "approval_wait" };

/** 「먼저 보내기」 전 큰 줄 — 크리에이터 승인 대기를 안내(UX 명세 gifts-orderNo, 2026-10-26 d136) */
export function notApprovedYetText(_creatorName: string): string {
  return "크리에이터 승인 대기 중입니다";
}

/** 크리에이터 승인을 아직 기다리는 진행 중 선물인가 — 승인은 줄 세운 단계가 아니라 출고의 조건이다(INV-S9 「승인은 출고 전에만 있으면 된다」).
 *  먼저 보내기를 눌렀어도 승인 전이면 참이다. */
export function awaitsApproval(view: FanGiftView): boolean {
  return view.outcome === "in_progress" && view.approval.state !== "done";
}

/** 상세 상태 판의 배지들(2026-10-26 d136, design-rules 33절) — 승인 전이면 「OO님 승인 대기」를 늘 함께 둔다(먼저 보내기를 누른 뒤에도).
 *  기본 배지가 이미 승인 대기면 이름 붙은 하나로 바꾼다. 목록은 그대로 fanBadge 하나만 쓴다. */
export function fanDetailBadges(view: FanGiftView): FanBadge[] {
  const base = fanBadge(view);
  if (!awaitsApproval(view)) return [base];
  const wait: FanBadge = { text: `${view.creatorName}님 승인 대기`, tone: "warn", kind: "approval_wait" };
  return base.kind === "approval_wait" ? [wait] : [base, wait];
}

/** 지금 상황 한 줄. "지금 단계"는 아직 끝나지 않은 단계라, 그 단계를 기다리는 말로 쓴다. */
export function fanHeadline(view: FanGiftView): string {
  if (view.outcome === "declined") return declinedText(view.creatorName);
  if (view.outcome === "expired") return EXPIRED_TEXT;
  if (view.outcome === "returned") return "검수 불합격으로 반송 대상이 된 선물입니다";
  if (view.outcome === "canceled") return "취소된 선물입니다";
  switch (currentKey(view)) {
    case "received":
      if (view.earlySendPending) return notApprovedYetText(view.creatorName);
      return view.fanTrackingNo ? "송장 등록 완료 · 팬꾹 도착 대기" : "팬꾹으로 상자를 발송해 주세요";
    case "inspected":
      return "팬꾹 도착 완료 · 검수 중";
    case "shipped":
      return view.approval.state === "done" ? "검수 완료 · 출고 대기" : "검수 완료 · 크리에이터 승인 대기";
    case "in_transit":
      return "출고 완료 · 택배사 인계 대기";
    case "delivered":
      return "크리에이터에게 배송 중입니다";
    default:
      return "배송이 완료되었습니다";
  }
}

/** 목록의 짧은 상태 표시. 색 갈래: 끝남 success · 팬/크리에이터를 기다림 warn · 거절·반송 danger · 진행 단계 info · 취소·등록 plain. */
export function fanBadge(view: FanGiftView): FanBadge {
  if (view.outcome === "declined") return { text: "거절", tone: "danger" };
  if (view.outcome === "expired") return { text: "기한 만료", tone: "danger" };
  if (view.outcome === "returned") return { text: "반송", tone: "danger" };
  if (view.outcome === "canceled") return { text: "취소", tone: "plain" };
  const current = currentKey(view);
  if (!current) return { text: "수령", tone: "success" };
  // INV-W14: 추적기 보관·신고 보관·경찰 인계 — 팬에게는 「확인 중」뿐(용어집 tracker_hold·report_hold·police_handover 행 팬 열)
  if (view.inspectionChecking) return { text: CHECKING_LABEL, tone: "warn" };
  if (current === "shipped" && view.approval.state !== "done") return EARLY_SEND_WAIT_BADGE;
  if (current === "received" && view.earlySendPending) return EARLY_SEND_WAIT_BADGE;
  if (current === "received") return { text: view.fanTrackingNo ? "도착 대기" : "발송 필요", tone: "warn" };
  const lastDone = [...view.steps].reverse().find((st) => st.state === "done");
  return lastDone ? { text: FAN_STEP_LABEL[lastDone.key], tone: "info" } : { text: "등록", tone: "plain" };
}

/** 단계 아래 한 줄 설명. 없으면 null. 시각은 날짜까지만 — 출고·배송·수령 시각은 크리에이터가 언제 받는지 좁히는 단서라 팬에게 보이지 않는다(2026-10-14 추가분 3). */
export function fanStepDetail(step: FanStep, view: FanGiftView): string | null {
  const at = step.at ? formatDate(step.at) : null;
  if (step.state === "stopped") return at ? `${at} · 반송` : "반송";
  if (step.state === "current") {
    if (step.key === "shipped" && view.approval.state !== "done") return "크리에이터 승인 등 출고 조건이 충족되면 발송됩니다. 출고 여부는 ‘보낸 선물’에서 확인할 수 있습니다";
    if (step.key === "received") return "팬꾹 도착 후 입고일 표시";
    if (step.key === "inspected") return view.inspectionChecking ? CHECKING_LABEL : "모든 상자는 탐지기 검수 후 출고됩니다";
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
  if (view.outcome === "declined" || view.outcome === "expired") return "not_accepted";
  if (view.outcome !== "in_progress") return "ended";
  return currentKey(view) ? "ongoing" : "ended";
}
