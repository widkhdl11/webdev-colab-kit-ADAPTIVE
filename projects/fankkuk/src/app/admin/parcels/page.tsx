import type { Metadata } from "next";
import { readOfficeParcels } from "@/entities/parcel/api/read-office-lists";
import { ParcelsPanel } from "@/widgets/admin-parcels/ui/parcels-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "들어온 상자 · 팬꾹 관리자" };
}

// 들어온 상자 (office-workflow INV-W1·W7). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const rows = await readOfficeParcels(supabase);
  return <ParcelsPanel rows={rows} />;
}
