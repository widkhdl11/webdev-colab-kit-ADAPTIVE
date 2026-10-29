import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { WithdrawWrite } from "../model/withdraw-account";

// 브라우저에서 회원 탈퇴 처리를 보낸다(/api/admin/accounts/withdraw, my-account INV-A15).
export function postWithdraw(write: WithdrawWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/accounts/withdraw", write, "탈퇴를 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
