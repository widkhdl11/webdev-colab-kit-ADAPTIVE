import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { HeldReturnWrite } from "../model/return-held";

// 브라우저에서 「반송으로 넘기기」를 보낸다(/api/admin/work/unmatched).
export function postHeldReturn(source: HeldReturnWrite["source"], id: string): Promise<PostJsonOutcome> {
  const write: HeldReturnWrite = { kind: "return", source, id };
  return postJson("/api/admin/work/unmatched", write, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
