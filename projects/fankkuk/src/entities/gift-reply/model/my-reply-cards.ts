import type { ViewerRole } from "@/entities/session/model/viewer";
import type { ReplyPhrase } from "./reply";

// 크리에이터 상세 「나에게 온 감사 카드」(docs/specs/my-reply-cards.md). 팬 본인 답장 읽기(my_gift_replies)가 돌려준 행에서 카드를 고른다.

/** INV-RC3: 한 페이지에 보이는 카드 수의 상한 */
export const MY_REPLY_CARDS_MAX = 20;

/** INV-RC4: 카드에 넘기는 칸은 이것뿐 — 주문번호·상자 ID·공개 동의·시각은 넘기지 않는다.
 *  카드 부품이 브라우저 부품이라 넘긴 칸은 페이지 데이터에 그대로 실린다(2026-11-13 보안 리뷰 — 상자 ID 를 목록 이름표로 넘겼던 것을 뺐다).
 *  사진은 이 크리에이터의 공개 사진을 페이지가 이미 갖고 있어 넘기지 않는다 */
export type MyReplyCard = {
  creatorName: string | null;
  phrase: ReplyPhrase;
  line: string | null;
  /** 답장 날짜(한국 시간 YYYY-MM-DD) — 시각은 없다 */
  repliedOn: string;
};

/** 읽어 온 행의 꼴 — 팬 본인 답장 읽기의 행에서 이 카드가 쓰는 칸만 */
type ReplyRow = {
  creatorName: string | null;
  /** 지웠거나 확인만이면 null */
  reply: { phrase: ReplyPhrase; line: string | null; repliedOn: string } | null;
};

/** INV-RC3·RC4: 답장이 있는 행만, 답장 날짜 최신순, 최대 MY_REPLY_CARDS_MAX 장. 같은 날짜는 읽어 온 순서를 지킨다 */
export function myReplyCardsOf(rows: readonly ReplyRow[]): MyReplyCard[] {
  return rows
    .flatMap((r) =>
      r.reply
        ? [{ creatorName: r.creatorName, phrase: r.reply.phrase, line: r.reply.line, repliedOn: r.reply.repliedOn }]
        : [],
    )
    .sort((a, b) => (a.repliedOn < b.repliedOn ? 1 : a.repliedOn > b.repliedOn ? -1 : 0))
    .slice(0, MY_REPLY_CARDS_MAX);
}

/** INV-RC2: 로그인한 팬이 이 크리에이터를 팔로우하고 있을 때만 읽는다(크리에이터·운영자·로그인 전·팔로우 전은 읽지 않는다) */
export function canSeeMyReplyCards(viewer: { role: ViewerRole } | null, following: boolean): boolean {
  return viewer?.role === "fan" && following;
}
