import type { Metadata } from "next";
import { readAdminProhibitedChanges, readAdminProhibitedItems } from "@/entities/parcel/api/read-admin-prohibited";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";
import { ProhibitedPanel } from "@/widgets/admin-prohibited/ui/prohibited-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "보낼 수 없는 물품 · 팬꾹 운영자" };
}

// 보낼 수 없는 물품 (admin-console INV-K9·K8). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const [items, changes] = await Promise.all([readAdminProhibitedItems(supabase), readAdminProhibitedChanges(supabase)]);
  return <ProhibitedPanel items={items} changes={changes} />;
}
