import type { ReviewSource } from "@/entities/payment/model/review-payments";
import { postJson, type PostJsonOutcome } from "@/shared/lib/http/post-json-client";

// 브라우저에서 대표의 「전액 취소」를 보낸다(/api/admin/payments/review-cancel, payment INV-M20). 금액은 보내지 않는다 — DB 가 정한다.
export function postReviewCancel(source: ReviewSource, tossOrderId: string): Promise<PostJsonOutcome> {
  return postJson("/api/admin/payments/review-cancel", { source, tossOrderId }, "취소하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}
