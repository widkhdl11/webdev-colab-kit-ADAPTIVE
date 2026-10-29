import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { VerificationAction } from "../model/run-verification-action";

// 브라우저에서 크리에이터의 본인 확인 처리를 보낸다(/api/creator/verification). 보내는 값은 채널 주소나 신청 식별값뿐이다.
export function sendVerification(action: VerificationAction): Promise<PostJsonOutcome> {
  return postJson("/api/creator/verification", action, "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
