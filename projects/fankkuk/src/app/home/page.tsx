import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { SAMPLE_NOTICES } from "@/entities/notice/api/sample-notices";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { fanGiftBucket } from "@/entities/order/ui/fan-stage-copy";
import { HomePage } from "@/widgets/home/ui/home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 팬 메인. 진행 중 선물·팔로우는 DB, 공지는 아직 예시(공지 화면을 DB 에 잇는 단계에서 바꾼다).
// 「진행 중」은 선물 내역의 「진행 중」 탭과 같은 기준(fanGiftBucket)이다.
// 크리에이터는 승인 요청으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect("/creator/requests");
  if (viewer?.role !== "fan") redirect("/login");
  const all = await readMyGiftViews(supabase);
  const gifts = all.filter((v) => fanGiftBucket(v) === "ongoing");
  const cards = await readCreatorCards(supabase, { signedIn: true });
  const following = cards.filter((c) => c.following).map(({ id, name, category, faceTone }) => ({ id, name, category, faceTone }));
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
  const notices = SAMPLE_NOTICES.toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/home", all)} />
      <HomePage nickname={viewer.nickname ?? ""} gifts={gifts} following={following} faceToneByName={faceToneByName} notices={notices} />
      <SiteFooter />
    </>
  );
}
