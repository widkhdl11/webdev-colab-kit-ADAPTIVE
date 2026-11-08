import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { readBoxLabels, readMyBox } from "@/entities/revgift-box/api/box-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { BoxLabelsPage } from "@/widgets/revgift-box/ui/box-labels-page";
import { loadSession } from "@/widgets/site-header/api/session-header";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "번호 라벨 — 팬꾹" };

// 번호 라벨 인쇄 (revgift-box INV-GB9·GB10) — 선물함 주인만, 상자 보내 주세요부터. 인쇄용이라 머리·바닥 틀 없이 그린다.
// 주인이 아니거나 아직 상자 고르기 전이면 없는 주소.
export default async function Page({ params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${encodeURIComponent(`/creator/revgift-boxes/${boxId}/labels`)}`);
  const [box, labels] = await Promise.all([readMyBox(supabase, boxId), readBoxLabels(supabase, boxId)]);
  if (!box || labels.kind !== "ok") notFound();
  return <BoxLabelsPage boxId={box.id} boxName={box.name} labels={labels.labels} />;
}
