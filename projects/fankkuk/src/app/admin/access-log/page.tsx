import type { Metadata } from "next";
import { readAdminAccessLog } from "@/entities/address/api/admin-access-log";
import { AccessLogPanel } from "@/widgets/admin-access-log/ui/access-log-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "주소 열람 기록 · 팬꾹 관리자" };
}

// 주소 열람 내부 기록 (address-protection INV-P7, 2026-10-12 문제집 D12). 읽기는 로그인한 운영자의 세션으로 —
// 운영자가 아니면 그 전에 404 고, DB 함수도 운영자가 아니면 거부한다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const entries = await readAdminAccessLog(supabase);
  return <AccessLogPanel entries={entries} />;
}
