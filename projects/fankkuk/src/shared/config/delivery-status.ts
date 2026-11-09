// 배송 현황 단계를 어디서 정하나(delivery-status INV-DS4 — 2026-11-09 결정 ③⑤).
// estimate = 배송 조회 웹훅 연결 전. 송장 출력·출고 시각·받는 쪽 확인과 지금 시각으로 단계를 계산한다.
// webhook  = 연결 뒤. 택배사 상태(집하·배송 중·배달 완료)를 쓰고 화면 구조는 그대로다. 지금은 자리와 형만 있고 연결은 하지 않았다.
// 값 하나만 바꾸면 전환된다 — 탈퇴 기준·선물함 delivered·주소 삭제 시점·헤더 아이콘은 연결 뒤 작업에서 이 값에 묶는다(결정 ⑧, 지금은 출고 기준 그대로).

export const DELIVERY_STATUS_SOURCES = ["estimate", "webhook"] as const;
export type DeliveryStatusSource = (typeof DELIVERY_STATUS_SOURCES)[number];

export const DELIVERY_STATUS_SOURCE: DeliveryStatusSource = "estimate";

/** 출고 뒤 「보통 1~2일 안에 도착해요」로 바뀌는 날 — 출고한 날(서울 날짜)의 다음 날 */
export const DELIVERY_ON_THE_WAY_AFTER_DAYS = 1;
/** 받는 쪽 확인이 없을 때 「도착했어요(예상)」로 바뀌는 날 — 출고한 날 + 3일(서울 날짜) */
export const DELIVERY_ESTIMATED_ARRIVAL_DAYS = 3;

/** 단계 문구 — 결정문(2026-11-09 ⑤) 그대로. 키는 shared/lib/delivery/delivery-stage 의 DeliveryStage */
export const DELIVERY_STAGE_LABEL = {
  sent: "팬꾹에서 보냈어요",
  on_the_way: "보통 1~2일 안에 도착해요",
  arrived: "도착했어요",
  arrived_estimated: "도착했어요(예상)",
} as const satisfies Record<"sent" | "on_the_way" | "arrived" | "arrived_estimated", string>;
