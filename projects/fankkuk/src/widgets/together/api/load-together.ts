import type { SupabaseClient } from "@supabase/supabase-js";
import { readMyFollowIds, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
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
// - 다음 기념일 칸·「선물 보내기」는 크리에이터 페이지와 같은 판정이다(INV-F5): 팔로우 → 「선물 보내기」/「팔로우하고 선물 보내기」,
//   쉬는 중이면 버튼 대신 「{날짜}부터 다시 받아요」. 차단은 여기서 가르지 않는다 — 등록 때 서버·DB 가 「선물을 받을 수 없는 크리에이터예요」로 막는다(decline-block INV-D7).
//   기념일 칸은 30일 안에 생일·기념일이 있을 때만 그린다(추가분 F-7 그대로).
// - 특별 카드는 화면 쪽 계산 함수 하나(specialMoments)로 정한다(INV-F4).

/** 처음에 펼쳐 보이는 최근 기록 수. 나머지(첫 선물 빼고)는 「이전 기록 N개 더 보기」로 접는다(시안 together.html). */
const RECENT_SHOWN = 4;

export type TogetherCard = TogetherGift & { moment: SpecialMoment | null; progress: GiftProgress; boxes: FanBoxReply[] };

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
};

/** 「10월 25일부터 다시 받아요」 — 쉬는 중이 아니면 null. */
function resumeTextOf(resumeOn: string | null, today: ReturnType<typeof kstToday>): string | null {
  if (!resumeOn || !isResting(resumeOn, today)) return null;
  const d = parseIsoDate(resumeOn);
  return d ? `${d.month}월 ${d.day}일부터 다시 받아요` : null;
}

export async function loadTogetherPage(input: {
  client: Pick<SupabaseClient, "rpc">;
  viewer: Viewer;
  creatorId: string;
  photoBase: string;
}): Promise<TogetherPageProps | null> {
  const { client, viewer, creatorId, photoBase } = input;
  const [summary] = await readMyTogether(client, creatorId);
  if (!summary) return null;
  const [gifts, replies, followedIds, receiving, ownCreatorId] = await Promise.all([
    readMyTogetherGifts(client, creatorId),
    readMyGiftReplies(client, null, creatorId),
    readMyFollowIds(client),
    readCreatorReceiving(client, [creatorId]),
    viewer.role === "creator" ? readOwnCreatorId(client) : Promise.resolve(null),
  ]);
  const today = kstToday(new Date());
  const receivingOf = receiving.get(creatorId) ?? null;
  const resumeText = resumeTextOf(receivingOf?.resumeOn ?? null, today);
  const dday = receivingOf ? upcomingDday(today, receivingOf.birthday, receivingOf.anniversaries) : null;
  const send = sendOnLinkPage(
    sendAvailabilityOf({ viewerRole: viewer.role, creatorId, ownCreatorId, following: followedIds.includes(creatorId) }),
    resumeText !== null,
  );
  const moments = specialMoments(gifts, summary.firstGiftOn);
  const cards: TogetherCard[] = gifts.map((g) => {
    const boxes = replies.filter((r) => r.orderNo === g.orderNo);
    return { ...g, moment: moments.get(g.giftNo) ?? null, progress: giftProgressOf(g, boxes.length), boxes };
  });
  const firstCard = cards.find((c) => c.giftNo === 1) ?? null;
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
  };
}
