import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { CreatorVerifyWrite } from "../model/set-creator-verified";

// 브라우저에서 크리에이터 본인 확인을 승인·취소한다(/api/admin/creators/verify).
export function postCreatorVerify(write: CreatorVerifyWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/creators/verify", write, "처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
