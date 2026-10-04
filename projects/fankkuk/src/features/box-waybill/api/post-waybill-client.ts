import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { BoxWaybillWrite, ShareWaybillWrite } from "../model/save-waybill";

// 브라우저에서 원 송장번호를 저장하고, 내 물건 찾기를 보낸다.

export type WaybillTarget = { kind: "box"; id: string } | { kind: "share"; id: string };

export function postWaybill(target: WaybillTarget, waybill: string): Promise<PostJsonOutcome> {
  if (target.kind === "box") {
    const write: BoxWaybillWrite = { boxId: target.id, waybill };
    return postJson("/api/gifts/boxes/waybill", write);
  }
  const write: ShareWaybillWrite = { shareId: target.id, waybill };
  return postJson("/api/revgifts/shares/waybill", write);
}

export function postMatch(boxId: string, waybill: string): Promise<PostJsonOutcome> {
  const write: BoxWaybillWrite = { boxId, waybill };
  return postJson("/api/gifts/boxes/match", write, "찾지 못했어요. 잠시 뒤 다시 해 주세요.");
}
