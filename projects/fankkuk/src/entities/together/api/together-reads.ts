import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 함께한 시간 읽기 (together INV-F1·F3·F6). 둘 다 DB 본인 읽기 함수다 — 사람은 로그인 토큰으로 정해지고 팬 ID 를 넘기지 않는다.
// - my_together: 크리에이터마다 개인 기록 숫자(함께한 선물·받은 답장·처음 선물한 날·며칠째). 숫자는 DB 가 센다(INV-F3).
// - my_together_gifts: 그 크리에이터에게 보낸 선물 카드 재료, 최신이 먼저.
// 응답 꼴은 여기서 검사한다: 정해지지 않은 칸이 섞여 오면(strict) 받지 않고, 날짜 칸은 YYYY-MM-DD 만 받는다 —
// 금액·시각 칸이 섞여 오면 오류로 던진다(INV-F6).

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function fail(what: string, code: string): never {
  throw new Error(`${what}을 읽지 못했다: ${code}`);
}

export type TogetherSummary = {
  creatorId: string;
  creatorName: string;
  creatorHandle: string | null;
  creatorPhotoPath: string | null;
  /** 결제가 끝나고 취소되지 않은 주문 수(거절·반려 포함) */
  giftCount: number;
  /** 그 주문들의 상자에 남은(지우지 않은) 답장 수 */
  replyCount: number;
  /** 가장 이른 주문 날짜(한국 시간) */
  firstGiftOn: string;
  /** 처음 선물한 날을 1일째로 센 오늘(한국 시간) */
  dayCount: number;
};

const summaryRow = z
  .object({
    creator_id: z.string().min(1),
    creator_name: z.string(),
    creator_handle: z.string().nullable(),
    creator_photo_path: z.string().nullable(),
    gift_count: z.number().int().positive(),
    reply_count: z.number().int().nonnegative(),
    first_gift_on: day,
    day_count: z.number().int().positive(),
  })
  .strict();

export function parseTogetherSummaries(rows: unknown): TogetherSummary[] {
  return z
    .array(summaryRow)
    .parse(rows)
    .map((r) => ({
      creatorId: r.creator_id,
      creatorName: r.creator_name,
      creatorHandle: r.creator_handle,
      creatorPhotoPath: r.creator_photo_path,
      giftCount: r.gift_count,
      replyCount: r.reply_count,
      firstGiftOn: r.first_gift_on,
      dayCount: r.day_count,
    }));
}

/** 로그인한 사람이 선물한 크리에이터마다 기록 한 줄, 최근에 선물한 크리에이터가 먼저. creatorId 를 주면 그 크리에이터만(없으면 빈 목록). */
export async function readMyTogether(client: Pick<SupabaseClient, "rpc">, creatorId: string | null = null): Promise<TogetherSummary[]> {
  const { data, error } = await client.rpc("my_together", { p_creator_id: creatorId });
  if (error) fail("함께한 시간 기록", error.code);
  return parseTogetherSummaries(data);
}

export const TOGETHER_OUTCOMES = ["in_progress", "declined", "expired", "returned"] as const;
export type TogetherOutcome = (typeof TOGETHER_OUTCOMES)[number];
export const TOGETHER_STAGES = ["registered", "received", "inspected", "shipped", "in_transit", "delivered"] as const;
export type TogetherStage = (typeof TOGETHER_STAGES)[number];

export type TogetherGift = {
  orderNo: string;
  /** 결제한 순서(1부터) — 본인 화면에서만 쓴다(INV-F4) */
  giftNo: number;
  registeredOn: string;
  itemKind: string;
  itemCategory: string | null;
  anniversaryName: string | null;
  boxCount: number;
  /** declined = 거절(직접·차단을 가르지 않는다), expired = 기간이 지나 반려 */
  outcome: TogetherOutcome;
  /** 주문이 지나온 마지막 단계 */
  stage: TogetherStage;
  approved: boolean;
  shippedOn: string | null;
  /** 팬이 올린 사진 — 판 번호만(경로는 화면에 오지 않는다) */
  photo: { version: number } | null;
};

const giftRow = z
  .object({
    order_no: z.string().min(1),
    gift_no: z.number().int().positive(),
    registered_on: day,
    item_kind: z.string(),
    item_category: z.string().nullable(),
    anniversary_name: z.string().nullable(),
    box_count: z.number().int().nonnegative(),
    outcome: z.enum(TOGETHER_OUTCOMES),
    stage: z.enum(TOGETHER_STAGES),
    approved: z.boolean(),
    shipped_on: day.nullable(),
    has_photo: z.boolean(),
    photo_version: z.number().int().nonnegative(),
  })
  .strict();

export function parseTogetherGifts(rows: unknown): TogetherGift[] {
  return z
    .array(giftRow)
    .parse(rows)
    .map((r) => ({
      orderNo: r.order_no,
      giftNo: r.gift_no,
      registeredOn: r.registered_on,
      itemKind: r.item_kind,
      itemCategory: r.item_category,
      anniversaryName: r.anniversary_name,
      boxCount: r.box_count,
      outcome: r.outcome,
      stage: r.stage,
      approved: r.approved,
      shippedOn: r.shipped_on,
      photo: r.has_photo ? { version: r.photo_version } : null,
    }));
}

/** 로그인한 사람이 그 크리에이터에게 보낸 선물 카드, 최신이 먼저. 남의 기록·없는 크리에이터면 빈 목록. */
export async function readMyTogetherGifts(client: Pick<SupabaseClient, "rpc">, creatorId: string): Promise<TogetherGift[]> {
  const { data, error } = await client.rpc("my_together_gifts", { p_creator_id: creatorId });
  if (error) fail("함께한 시간 선물", error.code);
  return parseTogetherGifts(data);
}
