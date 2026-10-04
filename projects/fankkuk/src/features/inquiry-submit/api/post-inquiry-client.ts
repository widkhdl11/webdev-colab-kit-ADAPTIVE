import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { InquiryInput } from "../model/inquiry-input";

// 브라우저에서 1:1 문의를 보낸다(/api/inquiries).
export function postInquiry(input: InquiryInput): Promise<PostJsonOutcome> {
  return postJson("/api/inquiries", input, "보내지 못했어요. 잠시 뒤 다시 해 주세요.");
}
