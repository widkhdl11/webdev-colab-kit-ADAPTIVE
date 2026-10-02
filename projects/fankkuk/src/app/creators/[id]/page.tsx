import { notFound } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

/** 「이런 크리에이터도 있어요」 줄에 보이는 수(시안 6명). */
const OTHERS_SHOWN = 6;

export const dynamic = "force-dynamic";

// 크리에이터 목록(DB)에서 이 id 를 찾는다. 목록에 없는 id(본인 확인 전·없는 사람)는 없는 주소로 취급한다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, viewer } = await loadSession();
  const header = await readSiteHeader(supabase, viewer, "/creators");
  const { id } = await params;
  const cards = await readCreatorCards(supabase, { signedIn: viewer !== null });
  const creator = cards.find((c) => c.id === id);
  if (!creator) notFound();
  const others = cards.filter((c) => c.id !== id).slice(0, OTHERS_SHOWN);
  return (
    <>
      <SiteHeader {...header} />
      <CreatorProfilePage creator={creator} others={others} followMode={followModeOf(viewer)} />
      <SiteFooter />
    </>
  );
}
