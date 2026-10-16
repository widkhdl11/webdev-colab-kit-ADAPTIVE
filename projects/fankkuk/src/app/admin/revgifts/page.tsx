import type { Metadata } from "next";
import { readRevgiftShares } from "@/entities/parcel/api/read-office-lists";
import { RevgiftsPanel } from "@/widgets/admin-revgifts/ui/revgifts-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "역조공 처리 · 팬꾹 운영자" };
}

// 역조공 처리 (office-workflow INV-W3·W6, reverse-gift INV-R10). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase, access } = await loadAdminSession();
  const rows = await readRevgiftShares(supabase);
  return <RevgiftsPanel rows={rows} access={access} now={new Date().toISOString()} />;
}
