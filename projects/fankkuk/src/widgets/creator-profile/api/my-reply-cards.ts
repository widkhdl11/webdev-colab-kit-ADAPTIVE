import type { SupabaseClient } from "@supabase/supabase-js";
import { readMyGiftReplies } from "@/entities/gift-reply/api/gift-reply-reads";
import { canSeeMyReplyCards, myReplyCardsOf, type MyReplyCard } from "@/entities/gift-reply/model/my-reply-cards";
import type { Viewer } from "@/entities/session/model/viewer";

/**
 * 상세 페이지 「나에게 온 감사 카드」 읽기(docs/specs/my-reply-cards.md).
 * INV-RC2: 팔로우한 팬이 아니면 읽기 함수를 부르지 않는다.
 * INV-RC1: 새 공개 읽기가 아니라 팬 본인 답장 읽기(my_gift_replies — 보낸 사람 = 로그인한 사람)를 이 크리에이터로 걸러 부른다.
 *          크리에이터 ID 는 거르개일 뿐이고, 누구의 답장인지는 그 요청의 로그인 세션(client)이 정한다(INV-RC5).
 * 읽지 못하면 빈 목록 — 페이지는 연다.
 */
export async function readMyReplyCardsFor(
  client: Pick<SupabaseClient, "rpc">,
  viewer: Viewer | null,
  creatorId: string,
  following: boolean,
): Promise<MyReplyCard[]> {
  if (!canSeeMyReplyCards(viewer, following)) return [];
  try {
    return myReplyCardsOf(await readMyGiftReplies(client, null, creatorId));
  } catch {
    return [];
  }
}
