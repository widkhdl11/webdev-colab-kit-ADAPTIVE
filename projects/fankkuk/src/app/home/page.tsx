import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { newestSearchable } from "@/entities/creator/model/newest-creators";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { fanGiftBucket } from "@/entities/order/ui/fan-stage-copy";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { HomePage } from "@/widgets/home/ui/home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 팬 메인(시안 v9-home B). 진행 중 선물·팔로우·새로 들어온 크리에이터·공지 모두 DB. 공지 줄은 고정 여부와 상관없이 최신 셋.
// 「진행 중」은 선물 내역의 「진행 중」 탭과 같은 기준(fanGiftBucket)이다.
// 크리에이터는 크리에이터 메인으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  const all = await readMyGiftViews(supabase);
  const gifts = all.filter((v) => fanGiftBucket(v) === "ongoing");
  const [cards, searchable] = await Promise.all([
    readCreatorCards(supabase, { signedIn: true }),
    readCreatorCards(supabase, { signedIn: false, forSearch: true }),
  ]);
  const newest = newestSearchable(cards, searchable);
  const following = cards.filter((c) => c.following).map(({ id, name, faceTone }) => ({ id, name, faceTone }));
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
  const notices = (await readNotices(supabase))
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/home", all)} />
      <HomePage nickname={viewer.nickname ?? ""} gifts={gifts} following={following} faceToneByName={faceToneByName} newest={newest} notices={notices} />
      <SiteFooter />
    </>
  );
}
