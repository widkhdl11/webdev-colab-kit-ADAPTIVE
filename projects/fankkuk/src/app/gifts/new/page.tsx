import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readMovingCreatorIds } from "@/entities/creator/api/creator-verification-reads";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { canSendGiftTo } from "@/features/gift-register/api/can-send";
import { pickOrder } from "@/features/gift-register/model/pick-order";
import { creatorSendList, fanSendList } from "@/features/gift-register/model/sender-rule";
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
// ?creator=<id> 로 들어오면(크리에이터 페이지의 「선물 보내기」) 그 사람을 미리 고른다. 목록에 없는 id 는 무시한다.
// 채널 이사 중(creator-verification INV-V12)인 크리에이터에는 표시를 붙인다(moving_creator_ids).
// 로그인하지 않았어도 폼은 보인다 — 「결제하기」에서 서버가 로그인을 요구한다(INV-L3).
// 크리에이터에게는 내가 팔로우한 크리에이터 + 크리에이터 페이지에서 미리 고른 사람(보낼 수 있으면)만 나온다
// (INV-L8·L9 — 판정은 등록 때 서버·DB 가 다시 한다. 나를 팔로우한 사람을 목록으로 모아 보여 주지 않는다).
// 팬·손님에게는 크리에이터 찾기 목록(찾기 노출을 켠 사람만, my-account INV-A10) + 미리 고른 한 명이 나온다 —
// 노출을 끈 크리에이터는 검색으로 찾지 못하지만, 링크를 아는 팬은 그 사람을 미리 고른 채로 보낼 수 있다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { creator, payment } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const creatorSender = viewer?.role === "creator";
  const preselectedId = typeof creator === "string" ? creator : null;
  const signedIn = viewer !== null;
  const [cards, ownCreatorId, preselectedCanSend, prices, movingIds] = await Promise.all([
    readCreatorCards(supabase, { signedIn, forSearch: !creatorSender }),
    creatorSender ? readOwnCreatorId(supabase) : Promise.resolve(null),
    creatorSender && preselectedId ? canSendGiftTo(supabase, preselectedId).catch(() => false) : Promise.resolve(false),
    readPublicPrices(supabase),
    readMovingCreatorIds(supabase),
  ]);
  // INV-V12: 채널 이사 중인 크리에이터는 목록에 그대로 두고 표시만 붙인다 — 고르면 안내하고 넘어가지 않는다(등록은 DB 가 막는다)
  const moving = new Set(movingIds);
  // 팬: 미리 고른 사람이 찾기 목록에 없으면(노출을 껐으면) 본인 확인을 마친 전체 목록에서 그 한 명만 찾아 더한다
  const fanPreselected =
    !creatorSender && preselectedId && !cards.some((c) => c.id === preselectedId)
      ? ((await readCreatorCards(supabase, { signedIn })).find((c) => c.id === preselectedId) ?? null)
      : null;
  const creators = (
    creatorSender
      ? creatorSendList(cards, ownCreatorId, preselectedId ? { id: preselectedId, canSend: preselectedCanSend } : null)
      : fanSendList(cards, fanPreselected)
  ).map((c) => ({ ...c, moving: moving.has(c.id) }));
  // 미리 고른 사람 → 내가 팔로우한 크리에이터 → 나머지 순으로 보여 준다(표시 순서만 — 보낼 수 있는지는 위에서 정했다)
  const ordered = pickOrder(creators, preselectedId);
  const initialCreatorId = typeof creator === "string" && ordered.some((c) => c.id === creator) ? creator : "";
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
        creatorSender={creatorSender}
      />
      <SiteFooter />
    </>
  );
}
