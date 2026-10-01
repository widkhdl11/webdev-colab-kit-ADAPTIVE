import { SAMPLE_CREATORS, SAMPLE_SIGNED_IN_CREATOR_ID } from "@/entities/creator/api/sample-creators";
import { SAMPLE_ORDERS, SAMPLE_SIGNED_IN_FAN } from "@/entities/order/api/sample-orders";
import { OFFICE_ADDRESS } from "@/entities/order/config/office-address";
import { pendingApprovalRequests } from "@/entities/order/model/creator-view";
import { toFanView } from "@/entities/order/model/fan-view";
import { fanBadge, headerGiftState } from "@/entities/order/ui/fan-stage-copy";
import type { HeaderGift, SiteHeaderProps } from "../ui/site-header";

// 예시 데이터로 헤더를 채운다. 로그인이 붙으면 세션의 사용자로 바꾼다(카드 d9).
// 「배송 완료는 3일 뒤 사라짐」은 수령 시각이 주문 기록에 없어 아직 적용하지 않는다(BACKLOG).

export function sampleFanHeader(current?: string): Extract<SiteHeaderProps, { role: "fan" }> {
  const gifts: HeaderGift[] = SAMPLE_ORDERS.filter((o) => o.fanNickname === SAMPLE_SIGNED_IN_FAN)
    .toSorted((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt))
    .map((o) => toFanView(o, OFFICE_ADDRESS))
    .flatMap((v) => {
      const state = headerGiftState(v);
      return state ? [{ orderNo: v.orderNo, creatorName: v.creatorName, state, label: fanBadge(v).text }] : [];
    });
  return { role: "fan", current, nickname: SAMPLE_SIGNED_IN_FAN, gifts };
}

export function sampleCreatorHeader(current?: string): Extract<SiteHeaderProps, { role: "creator" }> {
  const creator = SAMPLE_CREATORS.find((c) => c.id === SAMPLE_SIGNED_IN_CREATOR_ID);
  return {
    role: "creator",
    current,
    nickname: creator?.name ?? "",
    pendingCount: pendingApprovalRequests(SAMPLE_ORDERS, SAMPLE_SIGNED_IN_CREATOR_ID).length,
  };
}
