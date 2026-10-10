import { notFound } from "next/navigation";
import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readCreatorReceiving } from "@/entities/creator/api/receiving-reads";
import { kstToday } from "@/entities/creator/model/receiving";
import { readProhibitedItems } from "@/entities/parcel/api/read-prohibited-items";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { sendAvailabilityOf } from "@/features/gift-register/model/sender-rule";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

/** 「이런 크리에이터도 있어요」 줄에 보이는 수(시안 6명). */
const OTHERS_SHOWN = 6;

export const dynamic = "force-dynamic";

// 이 id 의 크리에이터를 한 명 읽기(DB)로 찾는다 — 찾기 노출을 껐어도 주소로는 열린다(my-account INV-A10 S10b).
// 본인 확인 전·없는 사람은 없는 주소로 취급한다. 「이런 크리에이터도 있어요」는 목록 읽기에서 고른다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, viewer } = await loadSession();
  const { id } = await params;
  // 크리에이터가 자기 페이지를 보면 팔로우·선물 보내기를 숨긴다(INV-L8). 팔로우하지 않았으면 「팔로우하고 선물 보내기」(INV-L9)
  const asCreator = viewer?.role === "creator";
  const [header, [creator], cards, ownCreatorId, prices, prohibited, receiving] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creators"),
    readCreatorCards(supabase, { signedIn: viewer !== null, onlyId: id }),
    readCreatorCards(supabase, { signedIn: viewer !== null }),
    asCreator ? readOwnCreatorId(supabase) : Promise.resolve(null),
    readPublicPrices(supabase),
    readProhibitedItems(supabase),
    // creator-receiving: 쉬는 중 날짜·생일·기념일만 — 한도는 이 페이지 응답에 넣지 않는다(INV-B6)
    readCreatorReceiving(supabase, [id]),
  ]);
  if (!creator) notFound();
  const others = cards.filter((c) => c.id !== id).slice(0, OTHERS_SHOWN);
  const send = sendAvailabilityOf({ viewerRole: viewer?.role ?? null, creatorId: id, ownCreatorId, following: creator.following });
  return (
    <>
      <SiteHeader {...header} />
      <CreatorProfilePage
        creator={creator}
        others={others}
        followMode={followModeOf(viewer, { creatorId: id, ownCreatorId })}
        send={send}
        prices={prices}
        prohibited={prohibited}
        receiving={receiving.get(id) ?? null}
        today={kstToday(new Date())}
      />
      <SiteFooter />
    </>
  );
}
