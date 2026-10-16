import type { Metadata } from "next";
import { readNotificationFailures } from "@/entities/notification/api/read-notification-failures";
import { readExpiryDue } from "@/entities/parcel/api/read-office-lists";
import { readUnsignedOpenAlerts } from "@/entities/address/api/unsigned-open-alerts";
import { AutomationPanel } from "@/widgets/admin-automation/ui/automation-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "자동 처리 현황 · 팬꾹 운영자" };
}

// 자동 처리 현황 (office-workflow INV-W6) + 승인 서명 없이 열린 주소 경보(creator-link INV-E11). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const [rows, failures, unsignedOpens] = await Promise.all([readExpiryDue(supabase), readNotificationFailures(supabase), readUnsignedOpenAlerts(supabase)]);
  return <AutomationPanel rows={rows} failures={failures} now={new Date().toISOString()} unsignedOpens={unsignedOpens} />;
}
