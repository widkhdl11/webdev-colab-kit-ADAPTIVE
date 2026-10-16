import type { SupabaseClient } from "@supabase/supabase-js";
import { reviewPaymentsFrom, type ReviewPayment } from "../model/review-payments";

// 「확인 필요」 결제 목록 읽기 (payment INV-M20). 로그인한 운영자의 세션 클라이언트로 부른다 — 운영자가 아니면 DB 가 거부한다.
// 칸 모양이 다르면 지어내지 않고 실패한다.

export async function readReviewPayments(client: Pick<SupabaseClient, "rpc">): Promise<ReviewPayment[]> {
  const { data, error } = await client.rpc("admin_review_payments");
  if (error) throw new Error(`확인 필요 결제 목록을 읽지 못했다: ${error.code}`);
  const rows = reviewPaymentsFrom(data);
  if (!rows) throw new Error("확인 필요 결제 목록의 형식이 다르다");
  return rows;
}
