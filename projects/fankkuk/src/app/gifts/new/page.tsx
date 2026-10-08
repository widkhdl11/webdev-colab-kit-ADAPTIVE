import { readCreatorCards, readMyFollowIds, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readMyRecentRecipientIds } from "@/entities/order/api/recent-recipients";
import { readMovingCreatorIds } from "@/entities/creator/api/creator-verification-reads";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { pickOrder } from "@/features/gift-register/model/pick-order";
import { sendList } from "@/features/gift-register/model/sender-rule";
import { GiftRegisterPage } from "@/widgets/gift-register/ui/gift-register-page";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

const PAYMENT_NOTICE: Record<string, string> = {
  failed: "결제를 마치지 못해 선물이 등록되지 않았어요. 다시 시도해 주세요.",
  in_progress: "같은 결제를 처리하는 중이에요. 잠시 뒤 선물 내역을 확인해 주세요.",
};

// 크리에이터 목록은 DB(본인 확인을 마친 크리에이터)에서 읽는다. 평균 승인 시간은 승인 기록으로 계산한 값,
// 기록이 없으면 소개 칸 값(approvalTimeOf — 다른 화면과 같은 값).
// session-login INV-L9(2026-10-07 바뀜, 카드 d41): 팬·크리에이터 모두 내가 팔로우한 크리에이터에게만 보낸다 — 목록도 그 사람들만이다.
// 크리에이터는 자기 자신을 뺀다(INV-L8). 판정은 등록 때 서버·DB 가 다시 한다.
// 순서: ?creator=<id> 로 미리 고른 사람 → 최근에 선물한 사람 → 최근에 팔로우한 사람(pickOrder).
// 미리 고른 사람을 팔로우하지 않았으면 목록에 넣지 않고 「팔로우하고 선물 보내기」를 따로 보여 준다.
// 채널 이사 중(creator-verification INV-V12)인 크리에이터에는 표시를 붙인다(moving_creator_ids).
// 로그인하지 않았어도 화면은 보인다 — 팔로우한 사람이 없으니 로그인 안내가 나온다(INV-L3).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { creator, payment } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const creatorSender = viewer?.role === "creator";
  const preselectedId = typeof creator === "string" ? creator : null;
  const signedIn = viewer !== null;
  const [cards, ownCreatorId, prices, movingIds, recentRecipientIds, followIds] = await Promise.all([
    readCreatorCards(supabase, { signedIn }),
    creatorSender ? readOwnCreatorId(supabase) : Promise.resolve(null),
    readPublicPrices(supabase),
    readMovingCreatorIds(supabase),
    signedIn ? readMyRecentRecipientIds(supabase) : Promise.resolve([]),
    signedIn ? readMyFollowIds(supabase) : Promise.resolve([]),
  ]);
  // INV-V12: 채널 이사 중인 크리에이터는 목록에 그대로 두고 표시만 붙인다 — 고르면 안내하고 넘어가지 않는다(등록은 DB 가 막는다)
  const moving = new Set(movingIds);
  const ordered = pickOrder(sendList(cards, ownCreatorId), { pinnedId: preselectedId, recentRecipientIds, followIds }).map((c) => ({
    ...c,
    moving: moving.has(c.id),
  }));
  const initialCreatorId = preselectedId && ordered.some((c) => c.id === preselectedId) ? preselectedId : "";
  // 미리 고른 사람을 아직 팔로우하지 않았으면(자기 자신이 아니면) 그 사람만 따로 — 팔로우하고 보내게
  // 노출을 끄고 팔로우하지 않은 크리에이터는 목록에 없다 — 주소로 고른 사람은 한 명 읽기로 찾는다(my-account INV-A10 S10b)
  const pickedCard =
    preselectedId && !initialCreatorId && preselectedId !== ownCreatorId
      ? (cards.find((c) => c.id === preselectedId) ?? (await readCreatorCards(supabase, { signedIn, onlyId: preselectedId }))[0])
      : undefined;
  const followFirst = pickedCard ? { id: pickedCard.id, name: pickedCard.name } : null;
  const notice = typeof payment === "string" ? PAYMENT_NOTICE[payment] : undefined;
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  if (!clientKey) console.warn("NEXT_PUBLIC_TOSS_CLIENT_KEY 가 없어 결제창을 열 수 없다");
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts/new")} />
      <GiftRegisterPage
        creators={ordered}
        prices={prices}
        initialCreatorId={initialCreatorId}
        clientKey={clientKey}
        notice={notice}
        signedIn={signedIn}
        followFirst={followFirst}
      />
      <SiteFooter />
    </>
  );
}
