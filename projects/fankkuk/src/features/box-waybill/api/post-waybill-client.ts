import type { Carrier } from "@/entities/parcel/model/carrier";
import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { BoxWaybillWrite, FindHeldWrite, NotMineWrite, ShareWaybillWrite } from "../model/save-waybill";

// 브라우저에서 배송 조회용 송장번호를 저장하고, 「받는 주소 없이 보냈어요」·「제가 보낸 게 아니에요」를 보낸다.

export type WaybillTarget = { kind: "box"; id: string } | { kind: "share"; id: string };

export function postWaybill(target: WaybillTarget, waybill: string): Promise<PostJsonOutcome> {
  if (target.kind === "box") {
    const write: BoxWaybillWrite = { boxId: target.id, waybill };
    return postJson("/api/gifts/boxes/waybill", write);
  }
  const write: ShareWaybillWrite = { shareId: target.id, waybill };
  return postJson("/api/revgifts/shares/waybill", write);
}

export function postFind(target: WaybillTarget, waybill: string, carrier: Carrier, senderInitial: string): Promise<PostJsonOutcome> {
  const common = { waybill, carrier, senderInitial };
  const write: FindHeldWrite = target.kind === "box" ? { boxId: target.id, ...common } : { shareId: target.id, ...common };
  return postJson("/api/gifts/boxes/match", write, "찾지 못했어요. 잠시 뒤 다시 해 주세요.");
}

export function postNotMine(target: WaybillTarget): Promise<PostJsonOutcome> {
  const write: NotMineWrite = target.kind === "box" ? { boxId: target.id } : { shareId: target.id };
  return postJson("/api/gifts/boxes/not-mine", write, "알리지 못했어요. 잠시 뒤 다시 해 주세요.");
}
