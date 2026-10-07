import type { Metadata } from "next";
import { readFindFlags, readInboundMetrics, readUnmatchedParcels } from "@/entities/parcel/api/read-office-lists";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";
import { UnmatchedPanel } from "@/widgets/admin-unmatched/ui/unmatched-panel";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "미확인 입고 · 팬꾹 관리자" };
}

// 미확인 입고 = 운영자 확인 목록 (office-workflow INV-W5·W6·W7, inbound-address-code INV-C9·C10).
// 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다. 측정 숫자를 못 읽어도 목록은 보인다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const [rows, flags, metrics] = await Promise.all([
    readUnmatchedParcels(supabase),
    readFindFlags(supabase),
    readInboundMetrics(supabase).catch(() => null),
  ]);
  return <UnmatchedPanel rows={rows} flags={flags} metrics={metrics} now={new Date().toISOString()} />;
}
