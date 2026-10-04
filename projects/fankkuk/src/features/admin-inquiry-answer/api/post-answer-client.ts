import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { InquiryAnswerWrite } from "../model/answer-inquiry";

// 브라우저에서 문의에 답을 보낸다(/api/admin/inquiries/answer).
export function postInquiryAnswer(write: InquiryAnswerWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/inquiries/answer", write, "보내지 못했어요. 잠시 뒤 다시 해 주세요.");
}
