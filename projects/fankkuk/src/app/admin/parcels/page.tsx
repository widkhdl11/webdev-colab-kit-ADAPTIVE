import type { Metadata } from "next";
import { readOfficeParcels } from "@/entities/parcel/api/read-office-lists";
import { readCreatorCheckChoices } from "@/features/admin-creator-check/model/process-check";
import { CreatorCheckChoices } from "@/features/admin-creator-check/ui/creator-check-choices";
import { ParcelsPanel } from "@/widgets/admin-parcels/ui/parcels-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "들어온 상자 · 팬꾹 운영자 화면" };
}

// 들어온 상자 (office-workflow INV-W1·W7). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
// 맨 위는 크리에이터가 받기·거절을 고른 블루투스 상자 — 운영자가 처리 버튼을 눌러야 상자가 움직인다(INV-W13).
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const [rows, choices] = await Promise.all([readOfficeParcels(supabase), readCreatorCheckChoices(supabase)]);
  return <ParcelsPanel rows={rows} top={<CreatorCheckChoices rows={choices} />} />;
}
