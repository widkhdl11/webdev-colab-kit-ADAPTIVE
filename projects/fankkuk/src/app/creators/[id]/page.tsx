import { notFound } from "next/navigation";
import {
  SAMPLE_CREATOR_PROFILES,
  SAMPLE_FOLLOWED_CREATOR_IDS,
  SAMPLE_LISTED_CREATORS,
} from "@/entities/creator/api/sample-creators";
import { toCreatorCards } from "@/entities/creator/model/creator-card";
import { CreatorProfilePage } from "@/widgets/creator-profile/ui/creator-profile-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { sampleFanHeader } from "@/widgets/site-header/api/sample-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

/** 「이런 크리에이터도 있어요」 줄에 보이는 수(시안 6명). */
const OTHERS_SHOWN = 6;

// 예시 데이터로 그린다. 목록에 없는 id 는 없는 주소로 취급한다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cards = toCreatorCards(SAMPLE_LISTED_CREATORS, SAMPLE_CREATOR_PROFILES, SAMPLE_FOLLOWED_CREATOR_IDS);
  const creator = cards.find((c) => c.id === id);
  if (!creator) notFound();
  const others = cards.filter((c) => c.id !== id).slice(0, OTHERS_SHOWN);
  return (
    <>
      <SiteHeader {...sampleFanHeader("/creators")} />
      <CreatorProfilePage creator={creator} others={others} />
      <SiteFooter />
    </>
  );
}
