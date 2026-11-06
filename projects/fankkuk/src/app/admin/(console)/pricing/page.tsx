import type { Metadata } from "next";
import { readAdminPriceChanges, readAdminPriceTable } from "@/entities/payment/api/read-admin-pricing";
import { PricingPanel } from "@/widgets/admin-pricing/ui/pricing-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "요금표 · 팬꾹 운영자" };
}

// 요금표 (admin-console INV-K2·K4·K5). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 DB 가 빈 결과를 주고, 그 전에 404 다.
export default async function Page() {
  const { supabase, access } = await loadAdminSession();
  const [table, changes] = await Promise.all([readAdminPriceTable(supabase), readAdminPriceChanges(supabase)]);
  return <PricingPanel table={table} changes={changes} access={access} />;
}
