import { redirect } from "next/navigation";
import { readPublicBannersOrNull } from "@/entities/banner/api/read-banners";
import { readMyAccessLog } from "@/entities/address/api/access-log-rows";
import { readMyCreatorLink, readMyCreatorLook } from "@/entities/creator/api/creator-link-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { creatorBackgroundUrl, creatorPhotoUrl, creatorSymbolUrl, nameInitial } from "@/entities/creator/model/link-images";
import { readNotices } from "@/entities/notice/api/notice-reads";
import { readCreatorActionItemsOrNull } from "@/entities/action-item/api/read-action-items";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { readMyGiftProgress } from "@/widgets/creator-gift-progress/api/read-gift-progress";
import { countProgress } from "@/widgets/creator-gift-progress/model/gift-progress";
import { bannerSlot } from "@/widgets/banner-carousel/ui/banner-slot";
import { CREATOR_HOME_LOG_ROWS, CreatorHomePage } from "@/widgets/home/ui/creator-home-page";
import { ACCOUNT_HREF } from "@/widgets/site-header/model/app-menu";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 메인 — 로그인한 크리에이터의 첫 화면(시안 v21-addendum3/cre-home.html). 맨 앞 프로필 구간은 본인 읽기 —
// 공개 이름·소개·팬덤 이름·두 색(my_creator_settings, creator-link INV-E13)·프로필 사진(my_creator_link)·배경사진·심볼(my_creator_look). 본인 확인 전에도 나온다.
// 크리에이터 처리할 일(my_creator_action_items — 사이드바 숫자와 바로가기 「처리할 일」이 같은 결과, action-center INV-J6)·진행 중인 선물 수(선물 현황과 같은 읽기 my_gift_progress — 머리 「진행 중 N건」과 같은 값, action-center INV-J9)·열람 기록(my_access_log)·공지(list_notices)·
// 내가 보낸 선물(my_gifts — 로그인한 사람이 보낸 주문)은 DB. 모두 인자 없이 로그인 토큰의 사람 것만 돌려준다.
// 광고 배너는 공개 읽기 한 번 — 바로가기 아래·공지 위(design-rules 16절 ②), 못 읽으면 칸만 없다(banners INV-Y8).
// 팬은 팬 메인으로, 로그인하지 않았으면 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const photoBase = readPublicStorageBase();
  const [actions, progress, accessLog, sentGifts, allNotices, settings, link, look, banners] = await Promise.all([
    readCreatorActionItemsOrNull(supabase),
    readMyGiftProgress(supabase).catch(() => null),
    readMyAccessLog(supabase, CREATOR_HOME_LOG_ROWS),
    readMyGiftViews(supabase),
    readNotices(supabase),
    readMyCreatorSettings(supabase),
    readMyCreatorLink(supabase),
    readMyCreatorLook(supabase),
    readPublicBannersOrNull(supabase, photoBase),
  ]);
  // h1 은 공개 이름(design-rules 12절 「홈」). 크리에이터 줄이 없으면 닉네임.
  const publicName = settings?.publicName ?? viewer.nickname ?? "";
  const notices = allNotices
    .toSorted((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map(({ id, title, date }) => ({ id, title, date }));
  return (
    <>
      <SiteHeader role="creator" current="/creator" nickname={viewer.nickname ?? ""} actionCount={actions?.length ?? 0} />
      <CreatorHomePage
        profile={{
          name: publicName,
          intro: settings?.intro ?? "",
          photoUrl: creatorPhotoUrl(photoBase, link?.photoPath ?? null),
          initial: nameInitial(publicName) || "?",
          backgroundUrl: creatorBackgroundUrl(photoBase, look?.bgPath ?? null),
          colors: settings?.colors ?? { personal: null, fan: null },
          fanName: settings?.fanName ?? "",
          symbolUrl: creatorSymbolUrl(photoBase, look?.symbolPath ?? null),
        }}
        accountHref={ACCOUNT_HREF.creator}
        actionCount={actions?.length ?? null}
        accessLog={accessLog}
        notices={notices}
        ongoingCount={progress ? countProgress(progress) : null}
        sentGifts={sentGifts}
        banner={bannerSlot(banners)}
      />
      <SiteFooter />
    </>
  );
}
