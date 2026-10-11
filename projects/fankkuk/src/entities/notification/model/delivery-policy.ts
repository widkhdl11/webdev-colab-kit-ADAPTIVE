// 알림 종류와 꼭 가는 알림 (notifications INV-N6 — 2026-10-12 문제집 D7). 정본은 스펙의 「알림 종류와 끌 수 있는지」 표이고
// 시험이 이 목록과 표를 맞대어 본다. 조치가 필요하거나 돈·상자가 걸린 알림은 받는 사람이 알림을 꺼도 간다.
// 실제로 보낼지(연락처를 내줄지)는 DB 가 줄의 종류로 정한다(public.notification_kind_must_deliver) — 이 목록은 본문 끝 안내와
// 설정 화면의 「끌 수 없는 알림」 문구를 만든다. DB 판정과 이 목록이 같은지는 통합 시험이 본다.

export const NOTIFICATION_KINDS = [
  "approval_request",
  "arrived",
  "inspected",
  "shipped",
  "in_transit",
  "delivered",
  "hold",
  "box_arrived",
  "hold_fan",
  "box_missing",
  "gift_pending_box",
  "gift_undelivered",
  "difference_due",
  "payment_canceled",
  "difference_canceled",
  "gift_reply",
  "gift_received",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationAudience = "fan" | "creator";

type Policy = {
  mustDeliver: boolean;
  /** 설정 화면 「끌 수 없는 알림」에 보일 이름 — 꼭 가는 알림만 */
  label: string | null;
  /** 이 종류를 받는 쪽(설정 화면 안내를 고를 때만 쓴다) */
  audience: NotificationAudience;
};

// 새 종류를 더하면 여기서 타입 오류가 난다 — 끌 수 있는지를 정하지 않은 종류는 만들 수 없다.
export const NOTIFICATION_POLICY: Record<NotificationKind, Policy> = {
  approval_request: { mustDeliver: true, label: "승인 요청", audience: "creator" },
  // 검수에서 위치 추적기가 나와 보낸 팬에게 돌려보내는 상자(INV-N13, 2026-10-12 문제집 D2 — 보관 없이 바로 반송). 종류 코드는 처음 이름 그대로
  hold: { mustDeliver: true, label: "돌려보내는 선물", audience: "creator" },
  hold_fan: { mustDeliver: true, label: "돌려보낼 상자", audience: "fan" },
  box_missing: { mustDeliver: true, label: "아직 도착하지 않은 상자", audience: "fan" },
  // 같은 이름으로 보인다 — 14일 안내와 거절 뒤 안내는 팬에게 같은 「아직 도착하지 않은 상자」다
  gift_pending_box: { mustDeliver: true, label: "아직 도착하지 않은 상자", audience: "fan" },
  gift_undelivered: { mustDeliver: true, label: "전해지지 못한 선물", audience: "fan" },
  difference_due: { mustDeliver: true, label: "추가 결제 요청", audience: "fan" },
  payment_canceled: { mustDeliver: true, label: "결제 취소", audience: "fan" },
  difference_canceled: { mustDeliver: true, label: "추가 결제 취소", audience: "fan" },
  arrived: { mustDeliver: false, label: null, audience: "fan" },
  inspected: { mustDeliver: false, label: null, audience: "fan" },
  shipped: { mustDeliver: false, label: null, audience: "fan" },
  in_transit: { mustDeliver: false, label: null, audience: "fan" },
  delivered: { mustDeliver: false, label: null, audience: "fan" },
  box_arrived: { mustDeliver: false, label: null, audience: "fan" },
  gift_reply: { mustDeliver: false, label: null, audience: "fan" },
  gift_received: { mustDeliver: false, label: null, audience: "fan" },
};

export const MUST_DELIVER_KINDS: readonly NotificationKind[] = NOTIFICATION_KINDS.filter((k) => NOTIFICATION_POLICY[k].mustDeliver);

function isKnownKind(kind: string): kind is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(kind);
}

/** 꼭 가는 알림인가. 모르는 종류는 아니다(DB 판정과 같다). */
export function isMustDeliver(kind: string): boolean {
  return isKnownKind(kind) && NOTIFICATION_POLICY[kind].mustDeliver;
}

/** 설정 화면 「끌 수 없는 알림」 목록 — 받는 쪽의 꼭 가는 알림 이름, 겹치는 이름은 한 번, 표 순서대로 */
export function mustDeliverLabels(audience: NotificationAudience): string[] {
  const out: string[] = [];
  for (const kind of MUST_DELIVER_KINDS) {
    const p = NOTIFICATION_POLICY[kind];
    if (p.audience === audience && p.label && !out.includes(p.label)) out.push(p.label);
  }
  return out;
}
