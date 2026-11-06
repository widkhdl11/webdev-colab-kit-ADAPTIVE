import type { Metadata } from "next";
import { readAdminInquiries } from "@/entities/inquiry/api/read-admin-inquiries";
import { readExpiryDue, readOfficeParcels, readRevgiftShares, readUnmatchedParcels } from "@/entities/parcel/api/read-office-lists";
import { readAdminPayments } from "@/entities/payment/api/read-admin-payments";
import { buildDashboardTiles, type Loaded } from "@/features/admin-dashboard/model/dashboard-tiles";
import { formatMonthDayKo } from "@/shared/lib/format/datetime";
import { DashboardPanel } from "@/widgets/admin-dashboard/ui/dashboard-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "대시보드 · 팬꾹 운영자" };
}

async function settle<T>(label: string, p: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await p };
  } catch (e) {
    console.error("대시보드 숫자를 읽지 못했다", label, e instanceof Error ? e.message : typeof e);
    return { ok: false };
  }
}

// 관리자 첫 화면 (docs/ux/pages/admin.md). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다(admin-console INV-K1 S1c).
// 목록 하나가 실패해도 화면은 그린다 — 그 목록으로 세는 칸만 「불러오지 못했습니다」.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const [parcels, held, inquiries, payments, shares, expiry] = await Promise.all([
    settle("들어온 상자", readOfficeParcels(supabase)),
    settle("보류 상자", readUnmatchedParcels(supabase)),
    settle("문의", readAdminInquiries(supabase)),
    settle("결제", readAdminPayments(supabase)),
    settle("역조공", readRevgiftShares(supabase)),
    settle("자동 처리", readExpiryDue(supabase)),
  ]);
  const now = new Date().toISOString();
  const tiles = buildDashboardTiles({ parcels, held, inquiries, payments, shares, expiry }, now);
  return <DashboardPanel tiles={tiles} today={formatMonthDayKo(now)} />;
}
