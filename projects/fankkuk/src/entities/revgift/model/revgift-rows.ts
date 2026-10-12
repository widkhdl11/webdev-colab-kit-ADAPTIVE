import { z } from "zod";
import { REVGIFT_ORDER_NO_PATTERN } from "./revgift-order-no";

// DB 읽기 함수가 돌려준 줄의 경계. 정해진 칸 밖의 값이 섞여 오면 목록 전체를 버린다 —
// 크리에이터 화면에 팬 주소·실명·전화·운송장, 그리고 팬 로그인 아이디가 나갈 길을 여기서도 막는다(INV-R8 — 크리에이터는 닉네임만 본다).

// 구간 목록은 결제 요금표의 구간(entities/payment PRICED_TIERS)과 같아야 한다. 같은 레이어의 다른 슬라이스라 가져다 쓸 수 없어
// 여기 적고, tests/tier-lists.test.ts 가 두 목록이 같은지 실제로 넣어 보고 확인한다.
const tier = z.enum(["small", "medium", "large"]);

const sentRow = z
  .object({
    order_no: z.string().regex(REVGIFT_ORDER_NO_PATTERN),
    sent_at: z.string(),
    fan_nickname: z.string(),
    tier,
    // INV-R8: 크리에이터에게는 세 가지뿐 — 거절과 기한 지남을 구분하지 않는다
    state: z.enum(["waiting", "accepted", "not_received"]),
    // INV-R14: 이 몫이 든 보내기에 사무실로 보낼 상자가 남았는지(보내기 단위 — DB 가 판정)
    ship_to_office: z.boolean(),
  })
  .strict();

export type SentRevgift = {
  orderNo: string;
  sentAt: string;
  fanNickname: string;
  tier: z.infer<typeof tier>;
  state: z.infer<typeof sentRow>["state"];
  shipToOffice: boolean;
};

export function parseSentRows(data: unknown): SentRevgift[] {
  return z
    .array(sentRow)
    .parse(data)
    .map((r) => ({ orderNo: r.order_no, sentAt: r.sent_at, fanNickname: r.fan_nickname, tier: r.tier, state: r.state, shipToOffice: r.ship_to_office }));
}

const receivedRow = z
  .object({
    order_no: z.string().regex(REVGIFT_ORDER_NO_PATTERN),
    creator_name: z.string(),
    tier,
    // 팬 본인 화면에서는 거절과 기한 지남을 나눠 보여 준다
    reply: z.enum(["waiting", "accepted", "declined", "expired"]),
    deadline: z.string(),
    shipped: z.boolean(),
    returned: z.boolean(),
    cancelled: z.boolean(),
  })
  .strict();

export type ReceivedRevgift = {
  orderNo: string;
  creatorName: string;
  tier: z.infer<typeof tier>;
  reply: z.infer<typeof receivedRow>["reply"];
  deadline: string;
  shipped: boolean;
  returned: boolean;
  cancelled: boolean;
};

export function parseReceivedRows(data: unknown): ReceivedRevgift[] {
  return z
    .array(receivedRow)
    .parse(data)
    .map((r) => ({ orderNo: r.order_no, creatorName: r.creator_name, tier: r.tier, reply: r.reply, deadline: r.deadline, shipped: r.shipped, returned: r.returned, cancelled: r.cancelled }));
}
