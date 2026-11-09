import {
  DELIVERY_ESTIMATED_ARRIVAL_DAYS,
  DELIVERY_ON_THE_WAY_AFTER_DAYS,
  DELIVERY_STATUS_SOURCE,
  type DeliveryStatusSource,
} from "@/shared/config/delivery-status";
import { seoulDaysUntil } from "@/shared/lib/format/datetime";

// 배송 현황 단계 계산 — 팬 선물(팬 → 크리에이터)과 선물함(크리에이터 → 팬)이 같은 함수를 쓴다(delivery-status INV-DS1·DS2·DS4).
// 시각에 따라 저절로 바뀌는 상태라 저장하지 않고, 원천(송장 출력·출고 날·받는 쪽 확인·택배사 상태)과 지금 시각으로 읽을 때 계산한다.
// 날짜 경계는 서울 날짜로 센다: 출고한 날 = 「팬꾹에서 보냈어요」, 다음 날부터 「보통 1~2일 안에 도착해요」, 출고 + 3일부터 확인이 없으면 「도착했어요(예상)」.
// 이 함수가 받는 칸에는 송장번호·택배 이력(대리점·기사·지역·수령인)이 없다 — 화면에 낼 수 없는 값은 처음부터 들어오지 않는다(INV-DS3).

export type DeliveryStage = "sent" | "on_the_way" | "arrived" | "arrived_estimated";

/** 웹훅이 줄 택배사 상태의 단계만(집하·배송 중·배달 완료). 이력의 다른 칸은 이 형에 없다 */
export type CarrierDeliveryState = "picked_up" | "in_transit" | "delivered";

export type DeliveryStageInput = {
  /** 송장을 출력했는가(팬꾹에서 보냄) */
  printed: boolean;
  /** 출고 확정 시각(ISO) 또는 서울 날짜(YYYY-MM-DD). 출고 전이면 null */
  shippedAt: string | null;
  /** 받는 쪽이 [받았어요]를 눌렀는가(크리에이터는 답장 스탬프로 누른 것도 같다) */
  confirmed: boolean;
  /** 웹훅 연결 뒤 택배사 상태. 연결 전에는 null */
  carrier?: CarrierDeliveryState | null;
};


/** 흐리게 보이는 단계 — 받는 쪽 확인 없이 날짜로만 짐작한 도착 */
export function isEstimatedStage(stage: DeliveryStage): boolean {
  return stage === "arrived_estimated";
}

const asInstant = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00+09:00` : v);

/** 지금 보일 배송 단계. 송장을 출력하지도 출고하지도 않았으면 null(배송 단계가 아직 없다). */
export function deliveryStage(input: DeliveryStageInput, nowIso: string, source: DeliveryStatusSource = DELIVERY_STATUS_SOURCE): DeliveryStage | null {
  if (!input.printed && input.shippedAt === null) return null;
  if (input.confirmed) return "arrived";
  if (source === "webhook") {
    if (input.carrier === "delivered") return "arrived";
    if (input.carrier === "picked_up" || input.carrier === "in_transit") return "on_the_way";
    return "sent";
  }
  if (input.shippedAt === null) return "sent";
  const days = seoulDaysUntil(nowIso, asInstant(input.shippedAt));
  if (days >= DELIVERY_ESTIMATED_ARRIVAL_DAYS) return "arrived_estimated";
  if (days >= DELIVERY_ON_THE_WAY_AFTER_DAYS) return "on_the_way";
  return "sent";
}
