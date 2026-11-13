import type { SupabaseClient } from "@supabase/supabase-js";
import { readCreatorCards, readCreatorSearchLooks, readMyFollowIds, readOtherCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readCreatorLinkExtras, readCreatorMonthFans } from "@/entities/creator/api/creator-link-reads";
import { readCreatorReceiving } from "@/entities/creator/api/receiving-reads";
import { readCreatorSignatureLinked } from "@/entities/creator/api/signature-link-reads";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorBackgroundUrl, creatorPhotoUrl, creatorSymbolUrl, type PublicCreatorLook } from "@/entities/creator/model/link-images";
import { kstToday, restingNotice } from "@/entities/creator/model/receiving";
import { readCreatorHardItems } from "@/entities/gift-item/api/hard-items-reads";
import { readBoxForFan, readCreatorOpenBoxes, type CreatorOpenBox } from "@/entities/revgift-box/api/box-reads";
import { readProhibitedItems } from "@/entities/parcel/api/read-prohibited-items";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import type { Viewer } from "@/entities/session/model/viewer";
import { giftSendOpenFor } from "@/features/creator-follow/model/creator-gift-open";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { sendAvailabilityOf, sendOnLinkPage } from "@/features/gift-register/model/sender-rule";
import type { CreatorProfilePageProps } from "../ui/creator-profile-page";
import { readMyReplyCardsFor } from "./my-reply-cards";

// 선물 링크 페이지 한 장의 읽기 (creator-link INV-E5·E7·E8). 링크 주소(/{아이디})와 옛 페이지 주소(/creators/{id})가 같이 쓴다 — 같은 페이지다.
// 읽는 것은 모두 공개 읽기 함수다: 크리에이터 한 명(creator_by_id — 공개 이름·아이디·사진 경로·소개·태그·승인 시간),
// 아래 줄의 다른 크리에이터 몇 명(list_other_creators — 목록 전체를 읽지 않는다), 받는 상태(쉬는 날·생일·기념일),
// 받기 어려운 품목 문구, 이번 달 팬 수(숫자 하나), 공개 요금표, 보낼 수 없는 것. 로그인했으면 팔로우 목록을 한 번 읽어 양쪽에 붙인다.
// 추천 크리에이터 카드의 배경사진은 찾기 화면과 같은 공개 꾸밈 읽기(find_creators_look — 로그인 전에도 공개)로 붙인다. 읽지 못하면 기본 배경.
// 「나에게 온 감사 카드」는 팔로우한 팬일 때만 팬 본인 답장 읽기(my_gift_replies)를 이 크리에이터로 걸러 읽는다(docs/specs/my-reply-cards.md INV-RC1·RC2).
// 공개 감사 답장 모음은 읽지 않는다(2026-11-12 시안 c판 사용자 지시 「답장은 받은 팬의 마이꾹에서만」 — e판 구현에서 뺐다).
// 선물함 입구의 내 신청 상태는 보는 사람이 팬일 때만, 선물함 화면과 같은 팬용 읽기(revgift_box_for_fan — 본인 신청 한 행만)로 선물함마다 읽는다.
// 팬덤 이름과 확인된 채널(플랫폼·채널 키·주소·확인 날짜, 추가분 4-1·4-3), 배경사진·팬덤 심볼·미리보기 고르기(「내 팬꾹 꾸미기」)도
// 공개 읽기 함수(creator_link_extras)로 읽는다 — 운영자 메모·인증 코드·심볼 권리 확인 시각은 그 함수가 돌려주지 않는다.
// 승인 서명 연결 여부는 참/거짓 하나만 읽는다(creator_signature_linked — creator-link INV-E15). 등록 정보는 읽지 않는다.
// 주소·주문·운송장·팬 목록·열람 건수를 읽는 함수는 부르지 않는다(INV-E7). 본인 확인 전·없는 크리에이터는 null(없는 페이지).

/** 「이런 크리에이터도 있어요」 줄에 보이는 수(시안 6명). */
const OTHERS_SHOWN = 6;

export type CreatorLinkPageData = { props: Omit<CreatorProfilePageProps, "look"> & { look: PublicCreatorLook } };

export async function loadCreatorLinkPage(input: {
  client: Pick<SupabaseClient, "rpc">;
  viewer: Viewer | null;
  creatorId: string;
  /** 페이지가 주소를 판정하며 이미 읽은 크리에이터(공개 읽기, 팔로우 여부 없음). 없으면 여기서 읽는다. */
  creator?: CreatorCard | null;
  /** 공개 저장소 주소(Supabase 주소) — 프로필 사진 주소를 만든다. */
  photoBase: string;
}): Promise<CreatorLinkPageData | null> {
  const { client, viewer, creatorId, photoBase } = input;
  const base = input.creator !== undefined ? input.creator : ((await readCreatorCards(client, { signedIn: false, onlyId: creatorId }))[0] ?? null);
  if (!base || base.id !== creatorId) return null;
  // 크리에이터가 자기 페이지를 보면 선물 보내기를 숨긴다(INV-L8). 팔로우하지 않았으면 「팔로우하고 선물 보내기」(INV-L9)
  const asCreator = viewer?.role === "creator";
  const followedIds = viewer ? await readMyFollowIds(client) : [];
  const [others, ownCreatorId, prices, prohibited, receiving, hardItems, monthFans, extras, linked, openBoxes, otherLooks, myReplyCards] = await Promise.all([
    readOtherCreatorCards(client, { excludeId: creatorId, limit: OTHERS_SHOWN, followedIds }),
    asCreator ? readOwnCreatorId(client) : Promise.resolve(null),
    readPublicPrices(client),
    readProhibitedItems(client),
    // creator-receiving: 쉬는 중 날짜·생일·기념일만 — 한도는 이 페이지 응답에 넣지 않는다(INV-B6)
    readCreatorReceiving(client, [creatorId]),
    // hard-items: 살아 있는 받기 어려운 품목의 품목·이유만 — 끝나는 날은 이 응답에 없다(INV-H6)
    readCreatorHardItems(client, [creatorId]),
    readCreatorMonthFans(client, creatorId),
    readCreatorLinkExtras(client, creatorId),
    readCreatorSignatureLinked(client, creatorId),
    // revgift-box: 공개·신청 받는 중인 선물함 이름만(입구). 읽지 못해도 페이지는 연다
    readCreatorOpenBoxes(client, creatorId)
      .then((boxes) => withMyBoxState(client, viewer, boxes))
      .catch(() => []),
    readCreatorSearchLooks(client).catch(() => ({}) as Awaited<ReturnType<typeof readCreatorSearchLooks>>),
    readMyReplyCardsFor(client, viewer, creatorId, followedIds.includes(creatorId)),
  ]);
  const creator = { ...base, following: followedIds.includes(creatorId) };
  const today = kstToday(new Date());
  const receivingOf = receiving.get(creatorId) ?? null;
  const resting = restingNotice(receivingOf?.resumeOn ?? null, today) !== null;
  const send = sendOnLinkPage(sendAvailabilityOf({ viewerRole: viewer?.role ?? null, creatorId, ownCreatorId, following: creator.following }), resting, linked);
  return {
    props: {
      creator: { ...creator, photoUrl: creatorPhotoUrl(photoBase, creator.photoPath) },
      others: others.map((o) => ({
        ...o,
        photoUrl: creatorPhotoUrl(photoBase, o.photoPath),
        backgroundUrl: creatorBackgroundUrl(photoBase, otherLooks[o.id]?.bgPath ?? null),
      })),
      followMode: followModeOf(viewer, { creatorId, ownCreatorId }),
      sendClosed: !giftSendOpenFor(viewer),
      send,
      prices,
      prohibited,
      receiving: receivingOf,
      hardItems: hardItems.get(creatorId) ?? null,
      monthFans,
      today,
      fanName: extras.fanName,
      channel: extras.channel,
      look: extras.look,
      backgroundUrl: creatorBackgroundUrl(photoBase, extras.look.bgPath),
      symbolUrl: creatorSymbolUrl(photoBase, extras.look.symbolPath),
      openBoxes,
      myReplyCards,
    },
  };
}

/**
 * 선물함 입구 타일의 내 신청 상태(revgift-box INV-GB9 — 내 순번만). 팬이 아니면 읽지 않는다(로그인 전·크리에이터·운영자는 「신청」 그대로).
 * 선물함 하나를 읽지 못하면 그 선물함만 상태 없이(「신청」) 둔다 — 신청 화면이 실제 상태를 다시 본다.
 */
async function withMyBoxState(client: Pick<SupabaseClient, "rpc">, viewer: Viewer | null, boxes: readonly CreatorOpenBox[]) {
  if (viewer?.role !== "fan") return boxes.map((b) => ({ ...b, myState: null, waitlistNo: null }));
  return Promise.all(
    boxes.map(async (b) => {
      const mine = await readBoxForFan(client, b.id, null).catch(() => null);
      return { ...b, myState: mine?.myState ?? null, waitlistNo: mine?.waitlistNo ?? null };
    }),
  );
}
