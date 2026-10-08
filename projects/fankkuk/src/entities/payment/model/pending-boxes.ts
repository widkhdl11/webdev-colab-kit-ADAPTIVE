import { z } from "zod";
import { PRICED_TIERS, type PricedTier } from "./price-table";

// 거절·반려 때 아직 안 온 상자 목록 (payment INV-M18). 대표가 팬에게 확인한 뒤 「도착하지 않음」으로 닫을 수 있는 상자들이다.
// DB 함수 admin_pending_boxes 가 준 줄을 화면 이름으로 옮긴다. 칸 모양이 다르면 지어내지 않고 null.

export type PendingBox = {
  boxId: string;
  /** 상자가 여럿인 주문이면 「주문번호-순번」 */
  label: string;
  orderNo: string;
  fanNickname: string;
  /** 신고 구간 — 등록 때 고른 값이라 요금표 구간 중 하나다 */
  tier: PricedTier;
  /** 닫으면 돌려줄 그 상자 금액 — 서버가 상자마다 저장한 값 */
  amountKrw: number;
  /** 주문이 거절·반려되어 이 상자의 6자리를 살려 둔 시각 */
  endedAt: string;
  /** 팬이 넣어 둔 배송 조회용 송장번호(확인용), 없으면 null */
  trackingNo: string | null;
};

const rowShape = z.object({
  box_id: z.string().uuid(),
  label: z.string(),
  order_no: z.string(),
  fan_nickname: z.string(),
  tier: z.enum(PRICED_TIERS),
  amount_krw: z.number().int(),
  ended_at: z.string(),
  tracking_no: z.string().nullable(),
});

export function pendingBoxesFrom(data: unknown): PendingBox[] | null {
  const parsed = z.array(rowShape).safeParse(data);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    boxId: r.box_id,
    label: r.label,
    orderNo: r.order_no,
    fanNickname: r.fan_nickname,
    tier: r.tier,
    amountKrw: r.amount_krw,
    endedAt: r.ended_at,
    trackingNo: r.tracking_no,
  }));
}
