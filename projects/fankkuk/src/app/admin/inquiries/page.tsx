import type { Metadata } from "next";
import { readAdminInquiries } from "@/entities/inquiry/api/read-admin-inquiries";
import { InquiriesPanel } from "@/widgets/admin-inquiries/ui/inquiries-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "1:1 문의 · 팬꾹 관리자" };
}

// 1:1 문의 (admin-console INV-K11·K8·K12 — 문의 제한 버튼은 대표에게만). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase, access } = await loadAdminSession();
  const inquiries = await readAdminInquiries(supabase);
  return <InquiriesPanel inquiries={inquiries} canRestrict={access === "owner"} />;
}
