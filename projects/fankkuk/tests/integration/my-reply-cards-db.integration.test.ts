import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readMyReplyCardsFor } from "@/widgets/creator-profile/api/my-reply-cards";
import { linkClient, verifyCreator } from "./creator-link-helpers";
import { CV, createCvAccounts, dropCvAccounts, resetCv } from "./creator-verification-helpers";
import { FAN_X, FAN_Y, giftBoxes, resetReplySettings } from "./gift-reply-helpers";
import { deleteTestOrders } from "./helpers";

// 크리에이터 상세 「나에게 온 감사 카드」(docs/specs/my-reply-cards.md) 중 DB 가 지키는 것 — 누구의 답장인지는 로그인 세션이 정한다(INV-RC1),
// 지운 답장은 카드가 되지 않는다(INV-RC3). 시험 크리에이터(cvt_*)·주문 넣기는 gift-reply-db 시험과 같은 도우미를 쓴다.

const A = CV.haru;
const B = CV.summer;
const client = linkClient;
const IDS = [A, B].map((c) => `'${c.creatorId}'`).join(", ");
const FAN = { userId: FAN_X.id, role: "fan" as const };

async function reply(boxId: string, phrase: string, line: string | null) {
  const r = await (await client(A.login)).rpc("confirm_gift_box", { p_box_id: boxId, p_phrase: phrase, p_line: line });
  if (r.error) throw new Error(`답장 실패: ${r.error.code}`);
}

beforeAll(() => {
  createCvAccounts();
});
beforeEach(() => {
  deleteTestOrders();
  resetCv();
  resetReplySettings(IDS);
  verifyCreator(A.creatorId, "cvt-rc-a");
  verifyCreator(B.creatorId, "cvt-rc-b");
});
afterAll(() => {
  deleteTestOrders();
  resetReplySettings(IDS);
  dropCvAccounts();
});

describe("INV-RC1: 보는 팬 본인이 보낸 선물의 답장만", () => {
  it("INV-RC1 S1: 별빛·달토끼 둘 다 A 에게 선물하고 A 가 둘 다 답장 — 별빛 세션으로 읽으면 별빛 답장만, 달토끼 한 줄은 어디에도 없다", async () => {
    const [mine] = giftBoxes(FAN_X.id, A.creatorId, 1);
    const [theirs] = giftBoxes(FAN_Y.id, A.creatorId, 1);
    await reply(mine!.boxId, "thanks", "별빛님 고마워요");
    await reply(theirs!.boxId, "love_it", "달토끼님 최고예요");
    const cards = await readMyReplyCardsFor(await client(FAN_X.login), FAN, A.creatorId, true);
    expect(cards.map((c) => [c.phrase, c.line])).toEqual([["thanks", "별빛님 고마워요"]]);
    expect(JSON.stringify(cards)).not.toContain("달토끼님 최고예요");
  });

  it("INV-RC1 S1b (실패경로): 크리에이터 ID 를 B 로 바꿔 읽어도 남의 답장은 나오지 않는다 — 별빛이 B 에게 보낸 것만(없으면 0장)", async () => {
    const [theirs] = giftBoxes(FAN_Y.id, B.creatorId, 1);
    await (await client(B.login)).rpc("confirm_gift_box", { p_box_id: theirs!.boxId, p_phrase: "cheered", p_line: "달토끼님께" });
    expect(await readMyReplyCardsFor(await client(FAN_X.login), FAN, B.creatorId, true)).toEqual([]);
  });
});

describe("INV-RC3: 지운 답장은 카드가 되지 않는다", () => {
  it("INV-RC3 S3b (실패경로): A 가 별빛 답장 하나를 지우면 그 카드는 빠진다", async () => {
    const [keep, gone] = giftBoxes(FAN_X.id, A.creatorId, 2);
    await reply(keep!.boxId, "thanks", null);
    await reply(gone!.boxId, "will_use", "지울 답장");
    const del = await (await client(A.login)).rpc("delete_gift_reply", { p_box_id: gone!.boxId });
    expect(del.error).toBeNull();
    const cards = await readMyReplyCardsFor(await client(FAN_X.login), FAN, A.creatorId, true);
    expect(cards.map((c) => c.phrase)).toEqual(["thanks"]);
  });
});
