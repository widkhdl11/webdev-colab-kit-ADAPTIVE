import type { Metadata } from "next";
import { readMetrics } from "@/entities/metrics/api/read-metrics";
import { buildMetricsView } from "@/entities/metrics/model/metrics-view";
import { MetricsPanel } from "@/widgets/admin-metrics/ui/metrics-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "측정 · 팬꾹 관리자" };
}

// 측정 (metrics INV-Q1~Q5). 대표·직원 모두 읽는다. 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 DB 가 거부하고(42501), 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  return <MetricsPanel view={buildMetricsView(await readMetrics(supabase))} />;
}
