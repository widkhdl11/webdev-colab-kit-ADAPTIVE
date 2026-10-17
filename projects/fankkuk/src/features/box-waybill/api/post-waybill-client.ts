import type { Carrier } from "@/entities/parcel/model/carrier";
import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { BoxWaybillWrite, FindHeldWrite, ShareWaybillWrite } from "../model/save-waybill";

// 브라우저에서 배송 조회용 송장번호를 저장하고, 「받는 주소 없이 보냈어요」를 보낸다.

export type WaybillTarget = { kind: "box"; id: string } | { kind: "share"; id: string };

export function postWaybill(target: WaybillTarget, waybill: string): Promise<PostJsonOutcome> {
  if (target.kind === "box") {
    const write: BoxWaybillWrite = { boxId: target.id, waybill };
    return postJson("/api/gifts/boxes/waybill", write);
  }
  const write: ShareWaybillWrite = { shareId: target.id, waybill };
  return postJson("/api/revgifts/shares/waybill", write);
}

export function postFind(target: WaybillTarget, waybill: string, carrier: Carrier): Promise<PostJsonOutcome> {
  const common = { waybill, carrier };
  const write: FindHeldWrite = target.kind === "box" ? { boxId: target.id, ...common } : { shareId: target.id, ...common };
  return postJson("/api/gifts/boxes/match", write, "찾지 못했어요. 잠시 뒤 다시 해 주세요.");
}

/** 「먼저 보내기」(approval-signature INV-S9) — 승인 전 주문의 받는 주소를 연다. 주문번호만 보낸다. */
export function postEarlySend(orderNo: string): Promise<PostJsonOutcome> {
  return postJson("/api/gifts/early-send", { orderNo }, "처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
