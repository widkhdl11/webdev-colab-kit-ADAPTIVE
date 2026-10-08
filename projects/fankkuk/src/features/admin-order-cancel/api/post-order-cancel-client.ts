import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { ReceivedGiftCancelWrite } from "../model/cancel-received-gift";

// 브라우저에서 대표의 입고 뒤 취소를 보낸다(/api/admin/orders/cancel, payment INV-M17).
export function postReceivedGiftCancel(write: ReceivedGiftCancelWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/orders/cancel", write, "취소하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
