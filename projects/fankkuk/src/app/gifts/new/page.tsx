import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import { canSendGiftTo } from "@/features/gift-register/api/can-send";
import { creatorSendList } from "@/features/gift-register/model/sender-rule";
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
// 로그인하지 않았어도 폼은 보인다 — 「결제하기」에서 서버가 로그인을 요구한다(INV-L3).
// 크리에이터에게는 내가 팔로우한 크리에이터 + 크리에이터 페이지에서 미리 고른 사람(보낼 수 있으면)만 나온다
// (INV-L8·L9 — 판정은 등록 때 서버·DB 가 다시 한다. 나를 팔로우한 사람을 목록으로 모아 보여 주지 않는다).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { creator, payment } = await searchParams;
  const { supabase, viewer } = await loadSession();
  const creatorSender = viewer?.role === "creator";
  const preselectedId = typeof creator === "string" ? creator : null;
  const [cards, ownCreatorId, preselectedCanSend, prices] = await Promise.all([
    readCreatorCards(supabase, { signedIn: viewer !== null }),
    creatorSender ? readOwnCreatorId(supabase) : Promise.resolve(null),
    creatorSender && preselectedId ? canSendGiftTo(supabase, preselectedId).catch(() => false) : Promise.resolve(false),
    readPublicPrices(supabase),
  ]);
  const creators = creatorSender
    ? creatorSendList(cards, ownCreatorId, preselectedId ? { id: preselectedId, canSend: preselectedCanSend } : null)
    : cards;
  const initialCreatorId = typeof creator === "string" && creators.some((c) => c.id === creator) ? creator : "";
  const notice = typeof payment === "string" ? PAYMENT_NOTICE[payment] : undefined;
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  if (!clientKey) console.warn("NEXT_PUBLIC_TOSS_CLIENT_KEY 가 없어 결제창을 열 수 없다");
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/gifts/new")} />
      <GiftRegisterPage
        creators={creators}
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
