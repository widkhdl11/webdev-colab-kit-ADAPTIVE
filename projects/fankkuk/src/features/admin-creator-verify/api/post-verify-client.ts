import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { CreatorVerificationDecision } from "../model/decide-creator-verification";

// 브라우저에서 운영자의 본인 확인 처리(승인·반려·승인 취소·횟수 풀기)를 보낸다(/api/admin/creators/verify).
export function postCreatorVerify(decision: CreatorVerificationDecision): Promise<PostJsonOutcome> {
  return postJson("/api/admin/creators/verify", decision, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
