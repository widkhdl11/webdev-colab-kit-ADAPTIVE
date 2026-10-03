import { notFound } from "next/navigation";
import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { canSendGiftTo } from "@/features/gift-register/api/can-send";
import { sendAvailabilityOf } from "@/features/gift-register/model/sender-rule";
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
  const { id } = await params;
  // 크리에이터가 볼 때: 자기 페이지면 팔로우·선물 보내기를 숨기고, 팔로우가 한쪽도 없으면 선물 보내기 대신 안내(INV-L8·L9)
  const asCreator = viewer?.role === "creator";
  const [header, cards, ownCreatorId, canSend] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creators"),
    readCreatorCards(supabase, { signedIn: viewer !== null }),
    asCreator ? readOwnCreatorId(supabase) : Promise.resolve(null),
    asCreator ? canSendGiftTo(supabase, id).catch(() => false) : Promise.resolve(false),
  ]);
  const creator = cards.find((c) => c.id === id);
  if (!creator) notFound();
  const others = cards.filter((c) => c.id !== id).slice(0, OTHERS_SHOWN);
  const send = sendAvailabilityOf({ viewerRole: viewer?.role ?? null, creatorId: id, ownCreatorId, canSend });
  return (
    <>
      <SiteHeader {...header} />
      <CreatorProfilePage
        creator={creator}
        others={others}
        followMode={followModeOf(viewer, { creatorId: id, ownCreatorId })}
        send={send}
      />
      <SiteFooter />
    </>
  );
}
