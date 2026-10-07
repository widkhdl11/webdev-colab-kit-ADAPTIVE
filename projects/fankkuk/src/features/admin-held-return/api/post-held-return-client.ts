import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { HeldReturnWrite } from "../model/return-held";

// 브라우저에서 「반송으로 넘기기」를 보낸다(/api/admin/work/unmatched).
export function postHeldReturn(id: string): Promise<PostJsonOutcome> {
  const write: HeldReturnWrite = { kind: "return", id };
  return postJson("/api/admin/work/unmatched", write, "처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
