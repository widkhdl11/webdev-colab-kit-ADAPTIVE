import type { Metadata } from "next";
import { readAdminOfficeAddress } from "@/entities/order/api/read-office-address";
import { OfficeAddressPanel } from "@/widgets/admin-office-address/ui/office-address-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "팬꾹 주소 · 팬꾹 운영자" };
}

// 팬꾹 주소 (admin-console INV-K19). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 DB 가 빈 값을 주고, 그 전에 404 다.
export default async function Page() {
  const { supabase, access } = await loadAdminSession();
  const data = await readAdminOfficeAddress(supabase);
  return <OfficeAddressPanel data={data} access={access} />;
}
