import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { GiftCancelWrite } from "../model/cancel-gift";

/** 팬의 입고 전 취소(payment INV-M16) — 주문번호만 보낸다. */
export function postGiftCancel(orderNo: string): Promise<PostJsonOutcome> {
  const write: GiftCancelWrite = { orderNo };
  return postJson("/api/gifts/cancel", write, "취소하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
