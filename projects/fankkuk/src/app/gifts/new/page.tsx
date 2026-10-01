import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { sampleApprovalMinutesByCreator } from "@/entities/order/api/sample-views";
import { GiftRegisterPage } from "@/widgets/gift-register/ui/gift-register-page";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

// 예시 데이터로 그린다. DB 가 붙으면 크리에이터 목록·승인 기록을 거기서 읽는다.
// 평균 승인 시간은 주문 기록으로 계산한다. 예시 주문이 없는 크리에이터만 소개 칸의 예시 값을 쓴다(approvalTimeOf — 다른 화면과 같은 값).
// ?creator=<id> 로 들어오면(크리에이터 페이지의 「선물 보내기」) 그 사람을 미리 고른다. 목록에 없는 id 는 무시한다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { creator } = await searchParams;
  const creators = toCreatorCards(
    SAMPLE_LISTED_CREATORS,
    SAMPLE_CREATOR_PROFILES,
    SAMPLE_FOLLOWED_CREATOR_IDS,
    sampleApprovalMinutesByCreator(),
  );
  const initialCreatorId = typeof creator === "string" && creators.some((c) => c.id === creator) ? creator : "";
  return (
    <>
      <SiteHeader {...sampleFanHeader("/gifts/new")} />
      <GiftRegisterPage creators={creators} initialCreatorId={initialCreatorId} />
      <SiteFooter />
    </>
  );
}
