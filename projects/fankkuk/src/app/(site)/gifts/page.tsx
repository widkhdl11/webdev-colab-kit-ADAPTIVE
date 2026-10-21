import { redirect } from "next/navigation";
import { readActionItemsOrNull, readCreatorActionItemsOrNull } from "@/entities/action-item/api/read-action-items";
import { sentGiftTodoOf } from "@/entities/action-item/model/creator-action-items";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { readMyTogether, readMyTogetherGifts } from "@/entities/together/api/together-reads";
import { togetherPath } from "@/entities/together/model/together-path";
import { senderRoleAllowed } from "@/features/gift-register/model/sender-rule";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { groupGiftsByCreator } from "@/widgets/gift-list/model/gift-groups";
import { GiftListPage } from "@/widgets/gift-list/ui/gift-list-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SentTabs } from "@/widgets/site-header/ui/sent-tabs";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";

export const dynamic = "force-dynamic";

// 로그인한 사람이 보낸 선물(DB 읽기 함수 my_gifts — 보낸 사람 것만, 보낸 사람이 봐도 되는 칸만).
// 팬·크리에이터 모두 넓은 틀(MyShell) 안에서 본다(메뉴·제목 「보낸 선물」, design-rules 00절). 운영자·손님은 로그인으로.
// 크리에이터별 묶음(action-center INV-J14): 묶음과 머리 숫자는 함께한 시간과 같은 읽기(my_together — 개인 기록 두 칸, my_together_gifts — 그 크리에이터에게 센 주문)로 만든다.
// 선물한 크리에이터가 한 명이어도 함께한 시간으로 넘기지 않는다(2026-10-21 — 묶음 하나가 보이므로 넘길 까닭이 없다).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (!viewer || !senderRoleAllowed(viewer.role)) redirect("/login");
  const giftsRead = readMyGiftViews(supabase);
  const togetherRead = readMyTogether(supabase).then((rows) =>
    Promise.all(rows.map(async (t) => ({ summary: t, orderNos: (await readMyTogetherGifts(supabase, t.creatorId)).map((g) => g.orderNo) }))),
  );
  // 지금 할 일 읽기는 한 번 — 사이드바 숫자와 카드 하늘 면(할 일이 있는 카드, design-rules 22절)이 같은 결과를 쓴다(action-center INV-J2)
  // 팬 = 팬 지금 할 일 줄의 주문, 크리에이터 = 보낸 선물 상세의 칸과 같은 거르기(sentGiftTodoOf)
  const todoRead: Promise<{ header: readonly unknown[] | null; has: (orderNo: string) => boolean }> =
    viewer.role === "fan"
      ? readActionItemsOrNull(supabase).then((a) => ({ header: a, has: (no: string) => (a ?? []).some((it) => it.orderNo === no) }))
      : readCreatorActionItemsOrNull(supabase).then((c) => ({ header: c, has: (no: string) => sentGiftTodoOf(c ?? [], no).length > 0 }));
  const [gifts, together, cards, header, todo] = await Promise.all([
    giftsRead,
    togetherRead,
    readCreatorCards(supabase, { signedIn: true }),
    Promise.all([giftsRead, todoRead]).then(([g, t]) => readSiteHeader(supabase, viewer, "/gifts", g, t.header)),
    todoRead,
  ]);
  const todoOrderNos = gifts.filter((g) => todo.has(g.orderNo)).map((g) => g.orderNo);
  const faceToneByName = Object.fromEntries(cards.map((c) => [c.name, c.faceTone]));
  const photoBase = readPublicStorageBase();
  const groups = groupGiftsByCreator(
    gifts,
    together.map(({ summary: t, orderNos }) => ({
      creatorId: t.creatorId,
      creatorName: t.creatorName,
      href: togetherPath({ id: t.creatorId, handle: t.creatorHandle }),
      photoUrl: creatorPhotoUrl(photoBase, t.creatorPhotoPath),
      giftCount: t.giftCount,
      replyCount: t.replyCount,
      orderNos,
    })),
  );
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        {/* 크리에이터는 사이드바 「보낸 내역」 한 칸에서 팬에게 보낸 역조공과 이 화면을 탭으로 오간다(design-rules 11절) */}
        <GiftListPage tabs={viewer.role === "creator" ? <SentTabs current="creators" /> : undefined} groups={groups} faceToneByName={faceToneByName} todoOrderNos={todoOrderNos} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
