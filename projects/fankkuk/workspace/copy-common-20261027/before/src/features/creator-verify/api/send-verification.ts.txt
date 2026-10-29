import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { VerificationAction } from "../model/run-verification-action";

// 브라우저에서 크리에이터의 본인 확인 처리를 보낸다(/api/creator/verification). 보내는 값은 채널 주소나 신청 식별값뿐이다.
export function sendVerification(action: VerificationAction): Promise<PostJsonOutcome> {
  return postJson("/api/creator/verification", action, "처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
