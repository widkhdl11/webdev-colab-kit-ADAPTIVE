import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";
import type { InquiryRestrictionWrite } from "../model/restrict-inquiry-author";

// 브라우저에서 문의 제한·풀기를 보낸다(/api/admin/inquiries/restriction).
export function postInquiryRestriction(write: InquiryRestrictionWrite): Promise<PostJsonOutcome> {
  return postJson("/api/admin/inquiries/restriction", write, "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
