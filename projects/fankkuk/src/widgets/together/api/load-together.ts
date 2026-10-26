import type { SupabaseClient } from "@supabase/supabase-js";
import { readFollowsCreator, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readCreatorLinkExtras } from "@/entities/creator/api/creator-link-reads";
import type { ChannelBadge } from "@/entities/creator/model/channel-badge";
import { readCreatorReceiving } from "@/entities/creator/api/receiving-reads";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { isResting, kstToday, parseIsoDate, upcomingDday } from "@/entities/creator/model/receiving";
import { readMyGiftReplies, type FanBoxReply } from "@/entities/gift-reply/api/gift-reply-reads";
import type { Viewer } from "@/entities/session/model/viewer";
import { readMyTogether, readMyTogetherGifts, type TogetherGift, type TogetherSummary } from "@/entities/together/api/together-reads";
import { giftProgressOf, type GiftProgress } from "@/entities/together/model/gift-progress";
import { specialMoments, type SpecialMoment } from "@/entities/together/model/special-moment";
import { togetherPath } from "@/entities/together/model/together-path";
import { sendAvailabilityOf, sendOnLinkPage, type LinkPageSend } from "@/features/gift-register/model/sender-rule";

// 「○○님과 함께한 시간」 한 장의 읽기 (together INV-F1·F3·F4·F5·F6).
// - 기록 숫자·선물 카드는 DB 본인 읽기 함수(로그인 토큰의 계정 주문만)가 준다. 그 크리에이터에게 센 선물이 없으면 null — 없는 페이지(INV-F1).
// - 상자별 받았어요·답장은 선물 상세와 같은 읽기(my_gift_replies, 크리에이터별)를 쓴다.
// - 다음 기념일 칸·「선물 보내기」는 크리에이터 페이지와 같은 판정이다(INV-F5): 팔로우 → 「선물 보내기」/「팔로우하고 선물 보내기」, 쉬는 중이면 버튼 대신 「{날짜}부터 다시 받아요」.
//   차단은 여기서 가르지 않는다 — 등록 때 서버·DB 가 「선물을 받을 수 없는 크리에이터예요」로 막는다(decline-block INV-D7).
//   기념일 칸은 30일 안에 생일·기념일이 있을 때만 그린다(추가분 F-7 그대로). 「선물 보내기」·「다시 받아요」는 그 칸 안에만 있다.
//   크리에이터 페이지가 없는(본인 확인 전) 크리에이터는 공개 받는 상태(creator_receiving)가 비어 기념일 칸이 없으니 보내기 자리도 없다.
// - 특별 카드는 화면 쪽 계산 함수 하나(specialMoments)로 정한다(INV-F4). 첫 선물 카드(순번 1)도 여기서 고른다.
// - 상단 프로필 옆 채널 소유 확인 표시(추가분 4-5)는 링크 페이지와 같은 공개 읽기(creator_link_extras)의 채널 칸만 쓴다 — 주문에서 나온 값이 아니고,
//   기록이 없으면 다른 읽기와 함께 버린다(INV-F1 그대로). 본인 확인이 취소된 크리에이터면 비어 표시가 없다.
// - 읽기는 한 번에 같이 보낸다. 기록이 없으면(없는 페이지) 나머지 결과는 버린다 — 모두 로그인한 사람 본인의 것이라 새어 나갈 것이 없다.

/** 처음에 펼쳐 보이는 최근 기록 수. 나머지(첫 선물 빼고)는 「이전 기록 N개 더 보기」로 접는다(시안 together.html). */
const RECENT_SHOWN = 4;

export type TogetherCard = TogetherGift & {
  moment: SpecialMoment | null;
  progress: GiftProgress;
  boxes: FanBoxReply[];
  /** 그 크리에이터에게 처음 보낸 선물(맨 아래 카드) */
  isFirst: boolean;
};

export type TogetherPageProps = {
  summary: TogetherSummary;
  creatorPhotoUrl: string | null;
  /** 이 화면 주소 — 다시 로그인한 뒤 돌아올 곳 */
  path: string;
  anniversary: { name: string; daysLeft: number; resumeText: string | null } | null;
  send: LinkPageSend;
  signedIn: boolean;
  recent: TogetherCard[];
  older: TogetherCard[];
  /** 맨 아래 첫 선물 카드 — 「○○님께 처음 보낸 선물이에요」. 최근·이전 기록에는 들어 있지 않다 */
  first: TogetherCard | null;
  photoBase: string;
  /** 크리에이터의 확인된 채널(공개 칸만) — 없으면 확인 표시를 그리지 않는다(추가분 4-5) */
  channel: ChannelBadge | null;
};

/** 「10월 25일부터 다시 받아요」 — 쉬는 중이 아니면 null. */
function resumeTextOf(resumeOn: string | null, today: ReturnType<typeof kstToday>): string | null {
  if (!resumeOn || !isResting(resumeOn, today)) return null;
  const d = parseIsoDate(resumeOn);
  return d ? `선물 받기 재개: ${d.month}월 ${d.day}일` : null;
}

function repliesByOrder(rows: readonly FanBoxReply[]): Map<string, FanBoxReply[]> {
  const out = new Map<string, FanBoxReply[]>();
  for (const r of rows) {
    const list = out.get(r.orderNo);
    if (list) list.push(r);
    else out.set(r.orderNo, [r]);
  }
  return out;
}

export async function loadTogetherPage(input: {
  client: Pick<SupabaseClient, "rpc">;
  viewer: Viewer;
  creatorId: string;
  photoBase: string;
}): Promise<TogetherPageProps | null> {
  const { client, viewer, creatorId, photoBase } = input;
  const [summaries, gifts, replies, following, receiving, ownCreatorId, extras] = await Promise.all([
    readMyTogether(client, creatorId),
    readMyTogetherGifts(client, creatorId),
    readMyGiftReplies(client, null, creatorId),
    readFollowsCreator(client, creatorId),
    readCreatorReceiving(client, [creatorId]),
    viewer.role === "creator" ? readOwnCreatorId(client) : Promise.resolve(null),
    readCreatorLinkExtras(client, creatorId),
  ]);
  const [summary] = summaries;
  if (!summary) return null;
  const today = kstToday(new Date());
  const receivingOf = receiving.get(creatorId) ?? null;
  const resumeText = resumeTextOf(receivingOf?.resumeOn ?? null, today);
  const dday = receivingOf ? upcomingDday(today, receivingOf.birthday, receivingOf.anniversaries) : null;
  const send = sendOnLinkPage(sendAvailabilityOf({ viewerRole: viewer.role, creatorId, ownCreatorId, following }), resumeText !== null);
  const moments = specialMoments(gifts, summary.firstGiftOn);
  const boxesOf = repliesByOrder(replies);
  const cards: TogetherCard[] = gifts.map((g) => {
    const boxes = boxesOf.get(g.orderNo) ?? [];
    return { ...g, moment: moments.get(g.giftNo) ?? null, progress: giftProgressOf(g, boxes.length), boxes, isFirst: g.giftNo === 1 };
  });
  const firstCard = cards.find((c) => c.isFirst) ?? null;
  const rest = firstCard ? cards.filter((c) => c !== firstCard) : cards;
  // 선물이 적으면 접지 않는다 — 첫 선물까지 모두 펼친다
  const fold = rest.length > RECENT_SHOWN + 1;
  return {
    summary,
    creatorPhotoUrl: creatorPhotoUrl(photoBase, summary.creatorPhotoPath),
    path: togetherPath({ id: summary.creatorId, handle: summary.creatorHandle }),
    anniversary: dday ? { name: dday.name, daysLeft: dday.daysLeft, resumeText } : null,
    send,
    signedIn: true,
    recent: fold ? rest.slice(0, RECENT_SHOWN) : rest,
    older: fold ? rest.slice(RECENT_SHOWN) : [],
    first: firstCard,
    photoBase,
    channel: extras.channel,
  };
}
