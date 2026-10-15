import { redirect } from "next/navigation";
import { readActionItems } from "@/entities/action-item/api/read-action-items";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readFanProfile } from "@/entities/fan/api/read-fan-profile";
import { fanImageUrl } from "@/entities/fan/model/fan-profile";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { fanGiftBucket } from "@/entities/order/ui/fan-stage-copy";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { HomePage } from "@/widgets/home/ui/home-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 팬 메인(시안 v21-addendum3/fan-home.html). 프로필 구간·진행 중 선물·팔로우·공지 모두 DB. 공지 줄은 고정 여부와 상관없이 최신 셋.
// 「진행 중」은 선물 내역의 「진행 중」 탭과 같은 기준(fanGiftBucket)이다.
// 크리에이터는 크리에이터 메인으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  // 서로 기대지 않는 읽기 다섯은 한꺼번에 — 프로필 구간은 공개 네 칸(my-account INV-A13). 못 읽으면 사진·소개 없이 닉네임만 그린다.
  // 처리할 일은 한 번 읽어 사이드바 숫자와 홈 한 줄에 함께 넘긴다(action-center INV-J2)
  const [all, cards, fanProfile, noticeRows, actions] = await Promise.all([
    readMyGiftViews(supabase),
    readCreatorCards(supabase, { signedIn: true }),
    readFanProfile(supabase, viewer.userId),
    readNotices(supabase),
    readActionItems(supabase),
  ]);
  const gifts = all.filter((v) => fanGiftBucket(v) === "ongoing");
  const following = cards.filter((c) => c.following).map(({ id, name, faceTone, handle, approvalMinutes }) => ({ id, name, faceTone, handle, approvalMinutes }));
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
  const photoBase = readPublicStorageBase();
  const profile = {
    photoUrl: fanImageUrl(photoBase, fanProfile?.photoPath ?? null),
    bgUrl: fanImageUrl(photoBase, fanProfile?.bgPath ?? null),
    intro: fanProfile?.intro ?? "",
  };
  const notices = noticeRows
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader {...await readSiteHeader(supabase, viewer, "/home", all, actions)} />
      <HomePage nickname={fanProfile?.nickname ?? viewer.nickname ?? ""} profile={profile} gifts={gifts} following={following} faceToneByName={faceToneByName} notices={notices} actionCount={actions.length} />
      <SiteFooter />
    </>
  );
}
