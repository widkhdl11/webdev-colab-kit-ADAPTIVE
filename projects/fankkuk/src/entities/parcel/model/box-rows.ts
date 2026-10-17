import { z } from "zod";
import { ADDRESS_CODE_PATTERN } from "./address-code";
import { PARCEL_TIER_GUIDE } from "./size-tier";

// 상자 한 개(팬 선물 상자 · 역조공 몫)의 배송 조회용 송장번호·상태·받는 주소 6자리 — DB 읽기 함수 my_gift_boxes·my_share_boxes 가 돌려준 줄의 경계.
// 정해진 칸 밖의 값이 섞여 오면 목록 전체를 버린다. 출고 운송장·실명·주소·전화가 화면에 나갈 길을 여기서도 막는다
// (office-workflow INV-W7, PRODUCT: 팬에게 출고 운송장 번호는 보여주지 않는다).

export const BOX_STATES = [
  "no_waybill",
  "awaiting",
  "received",
  "labeled",
  "inspected",
  "held",
  "return_waiting",
  "return_printed",
  "returned",
  "label_printed",
  "shipped",
  // 추적기 보관 · 신고 보관 · 경찰 인계(office-workflow INV-W14) — 운영자 목록에만 온다
  "tracker_held",
  "report_held",
  "police_handed",
  // 처분 대상 · 처분(office-workflow INV-W15) — 보낸 사람이 반송 대기부터 30일 안에 반송 주소를 확인하지 않은 상자 · 운영자가 처분을 기록한 상자(끝)
  "dispose_due",
  "disposed",
  // 확인 중 — 팬 읽기(my_gift_boxes)가 위 세 상태를 부르는 한 값(INV-W14)
  "checking",
  // 결제 + 30일이 지나도 오지 않아 닫힌 팬 선물 상자(office-workflow INV-W10). 6자리는 무효, 그 상자 금액은 환불 대상.
  "missing",
] as const;

export type BoxState = (typeof BOX_STATES)[number];

const state = z.enum(BOX_STATES);
const tier = z.enum(["small", "medium", "large"]).nullable();
const waybill = z.string().nullable();

export type BoxTier = z.infer<typeof tier>;

/** 입고 전(송장 없음·도착 기다림)에만 송장번호를 고친다. 입고되면 잠긴다(design-rules 8-1). DB 도 같은 때만 받는다(55000). */
export function isWaybillEditable(s: BoxState): boolean {
  return s === "no_waybill" || s === "awaiting";
}

/** 도착하지 않음으로 닫힌 상자(INV-W10) — 입고 전도 입고 뒤도 아니다. */
export function isMissing(s: BoxState): boolean {
  return s === "missing";
}

/** 사무실에 도착해 입고 확인을 받은 뒤의 상태 전부. */
export function hasArrived(s: BoxState): boolean {
  return !isWaybillEditable(s) && !isMissing(s);
}

export function boxTierName(t: BoxTier): string | null {
  return t ? `${PARCEL_TIER_GUIDE[t].name} 상자` : null;
}

/** 「제가 보낸 게 아니에요」를 누를 수 있는 때 — 입고된 뒤, 출고(또는 반송) 확정 전(inbound-address-code INV-C8). DB 도 같은 때만 받는다. */
export function canReportNotMine(s: BoxState): boolean {
  return hasArrived(s) && s !== "shipped" && s !== "returned";
}

// 받는 주소 6자리(inbound-address-code INV-C2): DB 가 로그인한 주문 주인에게만, 아직 유효할 때만 준다(거절·반려·취소·입고 뒤엔 null).
const addressCode = z.string().regex(ADDRESS_CODE_PATTERN).nullable();

const giftBoxRow = z
  .object({
    box_id: z.string().uuid(),
    label: z.string(),
    tier,
    waybill_no: waybill,
    state,
    address_code: addressCode,
    reported_not_mine: z.boolean(),
    send_ack_needed: z.boolean(),
  })
  .strict();

export type GiftBox = {
  boxId: string;
  label: string;
  tier: BoxTier;
  waybillNo: string | null;
  state: BoxState;
  /** 이 상자의 받는 주소 6자리 — 화면에서는 「이 선물의 받는 주소」의 끝자리로만 보인다 */
  addressCode: string | null;
  /** 「제가 보낸 게 아니에요」를 이미 눌렀다 */
  reportedNotMine: boolean;
  /** 승인 전 주문인데 「먼저 보내기」를 아직 누르지 않았다 — 받는 주소 대신 안내와 버튼을 그린다(approval-signature INV-S9) */
  sendAckNeeded: boolean;
};

export function parseGiftBoxRows(data: unknown): GiftBox[] {
  return z
    .array(giftBoxRow)
    .parse(data)
    .map((r) => ({
      boxId: r.box_id,
      label: r.label,
      tier: r.tier,
      waybillNo: r.waybill_no,
      state: r.state,
      addressCode: r.address_code,
      reportedNotMine: r.reported_not_mine,
      sendAckNeeded: r.send_ack_needed,
    }));
}

const shareBoxRow = z
  .object({
    share_id: z.string().uuid(),
    order_no: z.string(),
    fan_nickname: z.string(),
    tier,
    waybill_no: waybill,
    state,
    address_code: addressCode,
    reported_not_mine: z.boolean(),
  })
  .strict();

export type ShareBox = {
  shareId: string;
  orderNo: string;
  fanNickname: string;
  tier: BoxTier;
  waybillNo: string | null;
  state: BoxState;
  addressCode: string | null;
  reportedNotMine: boolean;
};

export function parseShareBoxRows(data: unknown): ShareBox[] {
  return z
    .array(shareBoxRow)
    .parse(data)
    .map((r) => ({
      shareId: r.share_id,
      orderNo: r.order_no,
      fanNickname: r.fan_nickname,
      tier: r.tier,
      waybillNo: r.waybill_no,
      state: r.state,
      addressCode: r.address_code,
      reportedNotMine: r.reported_not_mine,
    }));
}
