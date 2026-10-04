import type { Metadata } from "next";
import { readAdminNotices } from "@/entities/notice/api/read-admin-notices";
import { NoticesPanel } from "@/widgets/admin-notices/ui/notices-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "공지 · 팬꾹 관리자" };
}

// 공지 쓰기·고치기 (admin-console INV-K11). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const notices = await readAdminNotices(supabase);
  return <NoticesPanel notices={notices} />;
}
