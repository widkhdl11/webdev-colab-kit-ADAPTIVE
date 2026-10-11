import { nameInitial } from "@/shared/lib/format/name-initial";
import { creatorNameOrWithdrawn, dotDate, REPLY_PHRASE_TEXT, type ReplyPhrase } from "./reply";

// 답장 공유 카드에 넘기는 값 (gift-reply INV-G9). 카드 라우트는 DB 가 주인(보낸 팬)을 확인해 돌려준 줄을 여기에 넘기고, 돌아온 칸만 그린다 —
// 크리에이터 사진·공개 이름·답장(문구와 한 줄)·날짜, 팬이 고른 경우에만 팬 닉네임. 로고는 그리는 쪽에 있다.
// 주문번호·운송장·물품·팬이 올린 사진은 들어올 자리가 없다. 공유 글(「#팬꾹」·「@계정」)은 이미지가 아니라 글쓰기 창에 채운다(shareTextOf).

export type ReplyCardSource = {
  creatorName: string | null;
  creatorPhotoPath: string | null;
  phrase: ReplyPhrase;
  line: string | null;
  repliedOn: string;
  fanNickname: string;
};

export type ReplyCardInput = {
  creatorName: string;
  photoUrl: string | null;
  /** 사진이 없을 때 기본 이미지에 넣는 이름 첫 글자 */
  initial: string;
  phraseText: string;
  line: string | null;
  date: string;
  fanNickname: string | null;
};

export function replyCardInput(row: ReplyCardSource, opts: { withName: boolean; photoUrl: string | null }): ReplyCardInput {
  const creatorName = creatorNameOrWithdrawn(row.creatorName);
  return {
    creatorName,
    // 사진 주소는 부르는 쪽이 creatorPhotoPath 로 만들어 넘긴다(크리에이터 저장소 규칙은 creator 쪽에 있다).
    // 탈퇴한 크리에이터는 DB 가 사진 경로를 비워 보내 null — 기본 이미지
    photoUrl: opts.photoUrl,
    initial: row.creatorName ? nameInitial(row.creatorName) : "",
    phraseText: REPLY_PHRASE_TEXT[row.phrase],
    line: row.line,
    date: dotDate(row.repliedOn),
    fanNickname: opts.withName ? row.fanNickname : null,
  };
}
