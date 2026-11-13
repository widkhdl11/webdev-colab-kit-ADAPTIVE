import { describe, expect, it } from "vitest";
import type { FanBoxReply } from "../api/gift-reply-reads";
import { MY_REPLY_CARDS_MAX, canSeeMyReplyCards, myReplyCardsOf } from "./my-reply-cards";

// docs/specs/my-reply-cards.md — 크리에이터 상세 「나에게 온 감사 카드」.

function row(n: number, reply: FanBoxReply["reply"]): FanBoxReply {
  return {
    boxId: `00000000-0000-4000-c000-${String(n).padStart(12, "0")}`,
    orderNo: `FC-ORD${n}`,
    creatorId: "00000000-0000-4000-b000-000000000001",
    boxSeq: 1,
    boxCount: 1,
    received: true,
    receivedOn: "2026-11-01",
    creatorName: "하루",
    creatorPhotoPath: null,
    reply,
    fanPublic: false,
    fanShowNickname: false,
    xTag: null,
  };
}

const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;

describe("INV-RC3: 최신순 최대 MY_REPLY_CARDS_MAX 장, 지운 답장·확인만은 카드가 아니다", () => {
  it("INV-RC3: 답장 날짜 최신순으로 정렬한다", () => {
    const cards = myReplyCardsOf([row(1, { phrase: "thanks", line: null, repliedOn: day(3) }), row(2, { phrase: "love_it", line: "최고", repliedOn: day(9) }), row(3, { phrase: "cheered", line: null, repliedOn: day(5) })]);
    expect(cards.map((c) => c.repliedOn)).toEqual([day(9), day(5), day(3)]);
  });

  it("INV-RC3 (실패경로): 지운 답장·확인만(답장 없음)은 빠진다", () => {
    const cards = myReplyCardsOf([row(1, null), row(2, { phrase: "thanks", line: null, repliedOn: day(1) }), row(3, null)]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.phrase).toBe("thanks");
  });

  it("INV-RC3 (실패경로): 더 많으면 최신 MY_REPLY_CARDS_MAX 장까지만 — 가장 오래된 것부터 잘린다", () => {
    const rows = Array.from({ length: MY_REPLY_CARDS_MAX + 5 }, (_, i) => row(i + 1, { phrase: "thanks", line: null, repliedOn: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}` }));
    const cards = myReplyCardsOf(rows);
    expect(cards).toHaveLength(MY_REPLY_CARDS_MAX);
    const kept = new Set(cards.map((c) => c.repliedOn));
    const oldest = [...rows].map((r) => r.reply!.repliedOn).sort().slice(0, 5);
    for (const d of oldest) expect(kept.has(d)).toBe(false);
  });
});

describe("INV-RC4: 카드에 넘기는 칸은 크리에이터 이름·사진·문구·한 줄·날짜뿐", () => {
  it("INV-RC4: 주문번호·상자 ID·공개 동의·시각 칸이 없다 — 넘기는 칸은 페이지 데이터에 그대로 실린다", () => {
    const r = row(7, { phrase: "will_use", line: "고마워요", repliedOn: day(7) });
    const [card] = myReplyCardsOf([r]);
    expect(Object.keys(card!).sort()).toEqual(["creatorName", "line", "phrase", "repliedOn"].sort());
    expect(JSON.stringify(card)).not.toContain("FC-ORD7");
    expect(JSON.stringify(card)).not.toContain(r.boxId);
  });

  it("INV-RC4: 공개 동의를 끈 답장도 본인 카드에는 나온다", () => {
    const r = { ...row(8, { phrase: "touched", line: null, repliedOn: day(8) }), fanPublic: false };
    expect(myReplyCardsOf([r])).toHaveLength(1);
  });
});

describe("INV-RC2: 로그인한 팬이 팔로우하고 있을 때만 읽는다", () => {
  it("INV-RC2: 팬 + 팔로우 중이면 읽는다", () => {
    expect(canSeeMyReplyCards({ role: "fan" }, true)).toBe(true);
  });

  it("INV-RC2 (실패경로): 로그인 전 · 팔로우 전 · 크리에이터 · 운영자는 읽지 않는다", () => {
    expect(canSeeMyReplyCards(null, false)).toBe(false);
    expect(canSeeMyReplyCards(null, true)).toBe(false);
    expect(canSeeMyReplyCards({ role: "fan" }, false)).toBe(false);
    expect(canSeeMyReplyCards({ role: "creator" }, true)).toBe(false);
    expect(canSeeMyReplyCards({ role: "operator" }, true)).toBe(false);
  });
});
