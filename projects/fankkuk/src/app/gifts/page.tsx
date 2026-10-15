import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { readMyTogether } from "@/entities/together/api/together-reads";
import { togetherPath } from "@/entities/together/model/together-path";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { GiftListPage } from "@/widgets/gift-list/ui/gift-list-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SentTabs } from "@/widgets/site-header/ui/sent-tabs";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 로그인한 사람이 보낸 선물(DB 읽기 함수 my_gifts — 보낸 사람 것만, 보낸 사람이 봐도 되는 칸만).
// 팬·크리에이터 모두 넓은 틀(MyShell) 안에서 본다(메뉴·제목 「보낸 선물」, design-rules 00절). 운영자·손님은 로그인으로.
// 목록 위에 크리에이터별 「함께한 시간」으로 가는 줄을 둔다(추가분 F-7 — 내 선물을 크리에이터별로 묶어 들어간다, my_together).
// 선물한 크리에이터가 한 명이면 바로 그 「함께한 시간」으로 넘긴다. 「선물 내역으로」(?view=all)로 들어오면 넘기지 않는다.
// 넘길지는 크리에이터별 기록 하나로 정하고, 넘기지 않을 때만 나머지(선물 목록·얼굴 색·머리줄)를 같이 읽는다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { view } = await searchParams;
  const { supabase, viewer } = await loadSession();
  if (!viewer || !senderRoleAllowed(viewer.role)) redirect("/login");
  const together = await readMyTogether(supabase);
  if (view !== "all" && together.length === 1) {
    const [only] = together;
    redirect(togetherPath({ id: only!.creatorId, handle: only!.creatorHandle }));
  }
  const giftsRead = readMyGiftViews(supabase);
  const [gifts, cards, header] = await Promise.all([
    giftsRead,
    readCreatorCards(supabase, { signedIn: true }),
    giftsRead.then((g) => readSiteHeader(supabase, viewer, "/gifts", g)),
  ]);
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
  const photoBase = readPublicStorageBase();
  const creators = together.map((t) => ({
    creatorId: t.creatorId,
    name: t.creatorName,
    href: togetherPath({ id: t.creatorId, handle: t.creatorHandle }),
    photoUrl: creatorPhotoUrl(photoBase, t.creatorPhotoPath),
    giftCount: t.giftCount,
    replyCount: t.replyCount,
  }));
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        {/* 크리에이터는 사이드바 「보낸 내역」 한 칸에서 팬에게 보낸 역조공과 이 화면을 탭으로 오간다(design-rules 11절) */}
        <GiftListPage
          tabs={viewer.role === "creator" ? <SentTabs current="creators" /> : undefined}
          gifts={gifts}
          faceToneByName={faceToneByName}
          creators={creators}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
