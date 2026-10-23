import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { WithdrawWrite } from "../model/withdraw-account";

// 브라우저에서 회원 탈퇴 처리를 보낸다(/api/admin/accounts/withdraw, my-account INV-A15).
export function postWithdraw(write: WithdrawWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/accounts/withdraw", write, "탈퇴를 처리하지 못했어요. 잠시 뒤 다시 해 주세요.");
}
