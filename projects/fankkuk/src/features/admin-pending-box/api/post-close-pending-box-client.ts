import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { PendingBoxCloseWrite } from "../model/close-pending-box";

// 브라우저에서 대표의 「도착하지 않음」 닫기를 보낸다(/api/admin/boxes/close-pending, payment INV-M18).
export function postClosePendingBox(write: PendingBoxCloseWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/boxes/close-pending", write, "닫지 못했어요. 잠시 뒤 다시 해 주세요.");
}
