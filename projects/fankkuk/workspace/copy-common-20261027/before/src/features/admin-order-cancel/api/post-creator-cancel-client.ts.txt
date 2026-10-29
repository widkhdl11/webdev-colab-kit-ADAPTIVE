import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { CreatorCancelWrite } from "../model/cancel-for-creator";

// 브라우저에서 크리에이터 사정으로 취소를 보낸다(/api/admin/orders/creator-cancel, payment INV-M21).
export function postCreatorCancel(write: CreatorCancelWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/orders/creator-cancel", write, "취소하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
