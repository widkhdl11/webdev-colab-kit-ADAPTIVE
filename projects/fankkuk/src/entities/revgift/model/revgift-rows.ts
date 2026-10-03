import { z } from "zod";
import { REVGIFT_ORDER_NO_PATTERN } from "./revgift-order-no";

// DB 읽기 함수가 돌려준 줄의 경계. 정해진 칸 밖의 값이 섞여 오면 목록 전체를 버린다 —
// 크리에이터 화면에 팬 주소·실명·전화·운송장이 나갈 길을 여기서도 막는다(INV-R8).

const tier = z.enum(["small", "medium", "large"]);

const sentRow = z
  .object({
    order_no: z.string().regex(REVGIFT_ORDER_NO_PATTERN),
    sent_at: z.string(),
    fan_login_id: z.string(),
    fan_nickname: z.string(),
    tier,
    // INV-R8: 크리에이터에게는 세 가지뿐 — 거절과 기한 지남을 구분하지 않는다
    state: z.enum(["waiting", "accepted", "not_received"]),
  })
  .strict();

export type SentRevgift = {
  orderNo: string;
  sentAt: string;
  fanLoginId: string;
  fanNickname: string;
  tier: z.infer<typeof tier>;
  state: z.infer<typeof sentRow>["state"];
};

export function parseSentRows(data: unknown): SentRevgift[] {
  return z
    .array(sentRow)
    .parse(data)
    .map((r) => ({ orderNo: r.order_no, sentAt: r.sent_at, fanLoginId: r.fan_login_id, fanNickname: r.fan_nickname, tier: r.tier, state: r.state }));
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
};

export function parseReceivedRows(data: unknown): ReceivedRevgift[] {
  return z
    .array(receivedRow)
    .parse(data)
    .map((r) => ({ orderNo: r.order_no, creatorName: r.creator_name, tier: r.tier, reply: r.reply, deadline: r.deadline, shipped: r.shipped, returned: r.returned }));
}
