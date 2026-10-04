import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { ExpiryRunWrite } from "../model/run-expiry";

// 브라우저에서 자동 처리를 지금 돌린다(/api/admin/work/expiry).
export function postExpiryRun(write: ExpiryRunWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/work/expiry", write, "자동 처리를 돌리지 못했어요. 잠시 뒤 다시 해 주세요.");
}
