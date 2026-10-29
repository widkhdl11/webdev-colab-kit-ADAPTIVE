import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { ReceivedGiftCancelWrite } from "../model/cancel-received-gift";

// 브라우저에서 대표의 입고 뒤 취소를 보낸다(/api/admin/orders/cancel, payment INV-M17).
export function postReceivedGiftCancel(write: ReceivedGiftCancelWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/orders/cancel", write, "취소하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
