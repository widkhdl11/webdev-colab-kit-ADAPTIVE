import type { Metadata } from "next";
import { readAdminPayments } from "@/entities/payment/api/read-admin-payments";
import { readPendingBoxes } from "@/entities/payment/api/read-pending-boxes";
import { readReviewPayments } from "@/entities/payment/api/read-review-payments";
import { PaymentsPanel } from "@/widgets/admin-payments/ui/payments-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "결제·환불 · 팬꾹 운영자" };
}

// 결제·환불 내역 (admin-console INV-K1·K7·K8). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase, access } = await loadAdminSession();
  const [rows, pendingBoxes, reviewPayments] = await Promise.all([readAdminPayments(supabase), readPendingBoxes(supabase), readReviewPayments(supabase)]);
  return <PaymentsPanel rows={rows} pendingBoxes={pendingBoxes} reviewPayments={reviewPayments} access={access} />;
}
