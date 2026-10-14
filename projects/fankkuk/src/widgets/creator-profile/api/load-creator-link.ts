import type { SupabaseClient } from "@supabase/supabase-js";
import { readCreatorCards, readMyFollowIds, readOtherCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readCreatorLinkExtras, readCreatorMonthFans } from "@/entities/creator/api/creator-link-reads";
import { readCreatorReceiving } from "@/entities/creator/api/receiving-reads";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { kstToday, restingNotice } from "@/entities/creator/model/receiving";
import { readCreatorHardItems } from "@/entities/gift-item/api/hard-items-reads";
import { readReplyWall } from "@/entities/gift-reply/api/gift-reply-reads";
import { readProhibitedItems } from "@/entities/parcel/api/read-prohibited-items";
import { readPublicPrices } from "@/entities/payment/api/read-tier-prices";
import type { Viewer } from "@/entities/session/model/viewer";
import { followModeOf } from "@/features/creator-follow/model/follow-mode";
import { sendAvailabilityOf, sendOnLinkPage } from "@/features/gift-register/model/sender-rule";
import type { CreatorProfilePageProps } from "../ui/creator-profile-page";

// 선물 링크 페이지 한 장의 읽기 (creator-link INV-E5·E7·E8). 링크 주소(/{아이디})와 옛 페이지 주소(/creators/{id})가 같이 쓴다 — 같은 페이지다.
// 읽는 것은 모두 공개 읽기 함수다: 크리에이터 한 명(creator_by_id — 공개 이름·아이디·사진 경로·소개·태그·승인 시간),
// 아래 줄의 다른 크리에이터 몇 명(list_other_creators — 목록 전체를 읽지 않는다), 받는 상태(쉬는 날·생일·기념일),
// 받기 어려운 품목 문구, 이번 달 팬 수(숫자 하나), 감사 답장 모음(양쪽 동의 + 받았어요 3일 뒤, gift-reply INV-G7), 공개 요금표, 보낼 수 없는 것. 로그인했으면 팔로우 목록을 한 번 읽어 양쪽에 붙인다.
// 팬덤 이름과 확인된 채널(플랫폼·채널 키·주소·확인 날짜, 추가분 4-1·4-3)도 공개 읽기 함수(creator_link_extras)로 읽는다 — 운영자 메모·인증 코드는 그 함수가 돌려주지 않는다.
// 주소·주문·운송장·팬 목록·열람 건수를 읽는 함수는 부르지 않는다(INV-E7). 본인 확인 전·없는 크리에이터는 null(없는 페이지).

/** 「이런 크리에이터도 있어요」 줄에 보이는 수(시안 6명). */
const OTHERS_SHOWN = 6;

export type CreatorLinkPageData = { props: CreatorProfilePageProps };

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
  const [others, ownCreatorId, prices, prohibited, receiving, hardItems, monthFans, replies, extras] = await Promise.all([
    readOtherCreatorCards(client, { excludeId: creatorId, limit: OTHERS_SHOWN, followedIds }),
    asCreator ? readOwnCreatorId(client) : Promise.resolve(null),
    readPublicPrices(client),
    readProhibitedItems(client),
    // creator-receiving: 쉬는 중 날짜·생일·기념일만 — 한도는 이 페이지 응답에 넣지 않는다(INV-B6)
    readCreatorReceiving(client, [creatorId]),
    // hard-items: 살아 있는 받기 어려운 품목의 품목·이유만 — 끝나는 날은 이 응답에 없다(INV-H6)
    readCreatorHardItems(client, [creatorId]),
    readCreatorMonthFans(client, creatorId),
    // gift-reply INV-G7: 문구·한 줄·날짜·팬 닉네임(팬이 고른 경우만)뿐 — 조건 판정은 DB 공개 읽기 함수가 한다
    readReplyWall(client, creatorId),
    readCreatorLinkExtras(client, creatorId),
  ]);
  const creator = { ...base, following: followedIds.includes(creatorId) };
  const today = kstToday(new Date());
  const receivingOf = receiving.get(creatorId) ?? null;
  const resting = restingNotice(receivingOf?.resumeOn ?? null, today) !== null;
  const send = sendOnLinkPage(sendAvailabilityOf({ viewerRole: viewer?.role ?? null, creatorId, ownCreatorId, following: creator.following }), resting);
  return {
    props: {
      creator: { ...creator, photoUrl: creatorPhotoUrl(photoBase, creator.photoPath) },
      others: others.map((o) => ({ ...o, photoUrl: creatorPhotoUrl(photoBase, o.photoPath) })),
      followMode: followModeOf(viewer, { creatorId, ownCreatorId }),
      send,
      prices,
      prohibited,
      receiving: receivingOf,
      hardItems: hardItems.get(creatorId) ?? null,
      monthFans,
      replies,
      today,
      fanName: extras.fanName,
      channel: extras.channel,
    },
  };
}
