import type { SupabaseClient } from "@supabase/supabase-js";
import { paymentRowsFrom, type PaymentRow } from "../model/payment-rows";

// 관리자 「결제·환불」 화면의 읽기 (admin-console INV-K1·K7·K8). 로그인한 운영자의 세션 클라이언트로 부른다 —
// 운영자가 아니면 DB 가 빈 결과를 준다. 칸 모양이 다르면 지어내지 않고 실패한다.

export async function readAdminPayments(client: Pick<SupabaseClient, "rpc">): Promise<PaymentRow[]> {
  const { data, error } = await client.rpc("admin_payment_rows");
  if (error) throw new Error(`결제·환불 내역을 읽지 못했다: ${error.code}`);
  const rows = paymentRowsFrom(data);
  if (!rows) throw new Error("결제·환불 내역의 형식이 다르다");
  return rows;
}
