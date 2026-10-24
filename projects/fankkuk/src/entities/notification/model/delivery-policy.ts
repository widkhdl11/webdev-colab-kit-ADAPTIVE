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
  "creator_check",
  "box_no_code",
  "revgift_offer",
  // 반송 주소 확인과 14일 재알림(INV-N22, office-workflow INV-W15) — 주문을 보낸 사람(팬 선물은 팬, 역조공은 보낸 크리에이터)에게
  "return_address",
  "return_address_reminder",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationAudience = "fan" | "creator";

type Policy = {
  mustDeliver: boolean;
  /** 설정 화면 「끌 수 없는 알림」에 보일 이름 — 꼭 가는 알림만 */
  label: string | null;
  /** 이 종류를 받는 쪽(설정 화면 안내를 고를 때만 쓴다) */
  audience: NotificationAudience;
  /** 다른 쪽도 받는 종류 — 반송 주소 알림은 보낸 사람이 팬이든 크리에이터(보낸 역조공·보낸 팬 선물)든 간다(INV-N22) */
  alsoAudience?: NotificationAudience;
};

// 새 종류를 더하면 여기서 타입 오류가 난다 — 끌 수 있는지를 정하지 않은 종류는 만들 수 없다.
export const NOTIFICATION_POLICY: Record<NotificationKind, Policy> = {
  approval_request: { mustDeliver: true, label: "승인 요청", audience: "creator" },
  // 검수에서 위치 추적기가 나와 사무실에 보관한 상자 — 크리에이터에게 신고할지 묻는다(INV-N13, office-workflow INV-W14, 2026-10-17 카드 d100).
  // 이름은 용어집 tracker_hold 행의 크리에이터 라벨. 종류 코드는 처음 이름 그대로
  hold: { mustDeliver: true, label: "추적 장치 발견", audience: "creator" },
  hold_fan: { mustDeliver: true, label: "돌려보낼 상자", audience: "fan" },
  // 추적기 아님 블루투스·RF 상자를 받을지 묻는다 — 7일 안에 답이 없으면 반송(2026-10-12 (2) D3 ②)
  creator_check: { mustDeliver: true, label: "확인할 선물", audience: "creator" },
  box_missing: { mustDeliver: true, label: "아직 도착하지 않은 상자", audience: "fan" },
  // 같은 이름으로 보인다 — 14일 안내와 거절 뒤 안내는 팬에게 같은 「아직 도착하지 않은 상자」다
  gift_pending_box: { mustDeliver: true, label: "아직 도착하지 않은 상자", audience: "fan" },
  gift_undelivered: { mustDeliver: true, label: "전해지지 못한 선물", audience: "fan" },
  difference_due: { mustDeliver: true, label: "추가 결제 요청", audience: "fan" },
  payment_canceled: { mustDeliver: true, label: "결제 취소", audience: "fan" },
  difference_canceled: { mustDeliver: true, label: "추가 결제 취소", audience: "fan" },
  // 6자리 없이 온 상자가 닉네임과 맞았을 때(INV-N21, 카드 d94) — 도착부터 720시간(30일, 2026-10-21) 안에 찾지 않으면 착불 반송
  box_no_code: { mustDeliver: true, label: "팬꾹 주소 없이 보낸 상자", audience: "fan" },
  // 역조공 몫 결제 완료 때·72시간 뒤 받는 팬에게(INV-N20, 2026-10-16) — 7일 안에 정하지 않으면 받지 않음이 된다
  revgift_offer: { mustDeliver: true, label: "역조공 받기", audience: "fan" },
  // 반송 주소를 확인하지 않으면 반송되지 않고 30일 뒤 처분된다(INV-N22). 이름은 용어집 return_address 행의 카드 제목 — 첫 알림과 재알림이 한 이름으로 보인다
  return_address: { mustDeliver: true, label: "돌려받을 주소 확인", audience: "fan", alsoAudience: "creator" },
  return_address_reminder: { mustDeliver: true, label: "돌려받을 주소 확인", audience: "fan", alsoAudience: "creator" },
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
    if ((p.audience === audience || p.alsoAudience === audience) && p.label && !out.includes(p.label)) out.push(p.label);
  }
  return out;
}
