import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { REPLY_PHRASES, type ReplyPhrase, type ReplyState } from "../model/reply";

// 받았어요·답장 읽기 (gift-reply INV-G6·G7·G9·G10). 모두 DB 읽기 함수다 — 사람은 로그인 토큰으로 정해지고(공개 모음만 로그인 없이),
// 함수가 정한 칸만 돌려준다. 응답은 여기서 꼴을 검사한다: 정해지지 않은 칸이 섞여 오면(strict) 받지 않고,
// 날짜 칸은 YYYY-MM-DD 만 받는다 — 시각이 섞여 오면 오류로 던진다(INV-G6 「날짜만」).
// 팬 쪽 읽기(readMyGiftReplies)는 주문번호를 빼고 부르면 그 팬의 모든 상자를 준다 — 「함께한 시간」(together)이 같은 함수를 쓰고,
// 크리에이터를 주면 그 크리에이터에게 보낸 상자만 준다(크리에이터별 받은 답장 수, together INV-F3).

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const phrase = z.enum(REPLY_PHRASES);

function fail(what: string, code: string): never {
  throw new Error(`${what}을 읽지 못했다: ${code}`);
}

// ── 크리에이터 본인: 받은 상자 목록 · 아직 답장 안 한 수 ──────────────────

export type ReceivedBox = {
  boxId: string;
  orderNo: string;
  boxSeq: number;
  boxCount: number;
  senderNickname: string;
  /** 물품 종류 코드 그대로(together 읽기와 같다). 이름표로 바꾸는 일은 부르는 쪽이 gift-item 으로 한다. */
  itemCategory: string | null;
  itemKind: string;
  shippedOn: string;
  receivedOn: string | null;
  replyState: ReplyState;
  reply: { phrase: ReplyPhrase; line: string | null; repliedOn: string } | null;
};

const receivedRow = z
  .object({
    box_id: z.string().min(1),
    order_no: z.string().min(1),
    box_seq: z.number().int().positive(),
    box_count: z.number().int().positive(),
    sender_nickname: z.string(),
    item_category: z.string().max(40).nullable(),
    item_kind: z.string(),
    shipped_on: day,
    received_on: day.nullable(),
    reply_state: z.enum(["none", "confirmed", "replied", "deleted"]),
    phrase: phrase.nullable(),
    line: z.string().nullable(),
    replied_on: day.nullable(),
  })
  .strict();

export function parseReceivedBoxes(rows: unknown): ReceivedBox[] {
  return z
    .array(receivedRow)
    .parse(rows)
    .map((r) => ({
      boxId: r.box_id,
      orderNo: r.order_no,
      boxSeq: r.box_seq,
      boxCount: r.box_count,
      senderNickname: r.sender_nickname,
      itemCategory: r.item_category,
      itemKind: r.item_kind,
      shippedOn: r.shipped_on,
      receivedOn: r.received_on,
      replyState: r.reply_state,
      reply: r.reply_state === "replied" && r.phrase && r.replied_on ? { phrase: r.phrase, line: r.line, repliedOn: r.replied_on } : null,
    }));
}

/** 로그인한 크리에이터에게 출고된 상자, 최근 출고 순(my_received_boxes). */
export async function readMyReceivedBoxes(client: Pick<SupabaseClient, "rpc">): Promise<ReceivedBox[]> {
  const { data, error } = await client.rpc("my_received_boxes");
  if (error) fail("받은 상자", error.code);
  return parseReceivedBoxes(data);
}

/** INV-G10: 아직 답장 안 한 선물 수 — 로그인한 크리에이터 본인 것만. 크리에이터가 아니면 0. */
export async function readMyReplyPending(client: Pick<SupabaseClient, "rpc">): Promise<number> {
  const { data, error } = await client.rpc("my_gift_reply_pending");
  if (error) fail("답장 안 한 선물 수", error.code);
  return z.number().int().nonnegative().parse(data);
}

// ── 보낸 팬 본인: 상자별 받았어요·답장 ──────────────────

export type FanBoxReply = {
  boxId: string;
  orderNo: string;
  creatorId: string;
  boxSeq: number;
  boxCount: number;
  /** INV-G6: 받았어요 기록이나 배송 수령 중 하나라도 있으면 참 */
  received: boolean;
  /** 받았어요 날짜(한국 시간) — 받았어요 기록이 있으면 그 날짜, 없고 배송 수령만 있으면 수령 날짜. 수령 시각이 기록되기 전에 수령된 주문은 null */
  receivedOn: string | null;
  /** 탈퇴한 크리에이터면 null */
  creatorName: string | null;
  creatorPhotoPath: string | null;
  /** 지우지 않은 답장. 없거나 지웠으면 null */
  reply: { phrase: ReplyPhrase; line: string | null; repliedOn: string } | null;
  fanPublic: boolean;
  fanShowNickname: boolean;
  /** 공유 글에 붙일 X 계정 — 크리에이터가 등록하고 태그를 허용했을 때만 */
  xTag: string | null;
};

const fanRow = z
  .object({
    box_id: z.string().min(1),
    order_no: z.string().min(1),
    creator_id: z.string().min(1),
    box_seq: z.number().int().positive(),
    box_count: z.number().int().positive(),
    received: z.boolean(),
    received_on: day.nullable(),
    creator_name: z.string().nullable(),
    creator_photo_path: z.string().nullable(),
    phrase: phrase.nullable(),
    line: z.string().nullable(),
    replied_on: day.nullable(),
    fan_public: z.boolean(),
    fan_show_nickname: z.boolean(),
    x_tag: z.string().nullable(),
  })
  .strict();

export function parseFanBoxReplies(rows: unknown): FanBoxReply[] {
  return z
    .array(fanRow)
    .parse(rows)
    .map((r) => ({
      boxId: r.box_id,
      orderNo: r.order_no,
      creatorId: r.creator_id,
      boxSeq: r.box_seq,
      boxCount: r.box_count,
      received: r.received,
      receivedOn: r.received_on,
      creatorName: r.creator_name,
      creatorPhotoPath: r.creator_photo_path,
      reply: r.phrase && r.replied_on ? { phrase: r.phrase, line: r.line, repliedOn: r.replied_on } : null,
      fanPublic: r.fan_public,
      fanShowNickname: r.fan_show_nickname,
      xTag: r.x_tag,
    }));
}

/**
 * 로그인한 사람이 보낸 주문의 출고 상자. orderNo 를 주면 그 주문만(남의 주문번호면 빈 목록),
 * creatorId 를 주면 그 크리에이터에게 보낸 것만.
 */
export async function readMyGiftReplies(
  client: Pick<SupabaseClient, "rpc">,
  orderNo?: string | null,
  creatorId?: string | null,
): Promise<FanBoxReply[]> {
  const { data, error } = await client.rpc("my_gift_replies", { p_order_no: orderNo ?? null, p_creator_id: creatorId ?? null });
  if (error) fail("받았어요·답장", error.code);
  return parseFanBoxReplies(data);
}

// ── 공유 카드 재료 (INV-G9) ──────────────────

export type ReplyCardRow = {
  creatorName: string | null;
  creatorPhotoPath: string | null;
  phrase: ReplyPhrase;
  line: string | null;
  repliedOn: string;
  /** 로그인한 팬 자신의 닉네임 — 카드에 넣을지는 팬이 고른다 */
  fanNickname: string;
  xTag: string | null;
};

const cardRow = z
  .object({
    creator_name: z.string().nullable(),
    creator_photo_path: z.string().nullable(),
    phrase,
    line: z.string().nullable(),
    replied_on: day,
    fan_nickname: z.string(),
    x_tag: z.string().nullable(),
  })
  .strict();

/** 로그인한 팬이 보낸 상자의 지우지 않은 답장 하나. 남의 상자·답장 없음·지움이면 null. */
export async function readMyReplyCard(client: Pick<SupabaseClient, "rpc">, boxId: string): Promise<ReplyCardRow | null> {
  const { data, error } = await client.rpc("my_gift_reply_card", { p_box_id: boxId });
  if (error) fail("답장 카드", error.code);
  const [r] = z.array(cardRow).max(1).parse(data);
  if (!r) return null;
  return {
    creatorName: r.creator_name,
    creatorPhotoPath: r.creator_photo_path,
    phrase: r.phrase,
    line: r.line,
    repliedOn: r.replied_on,
    fanNickname: r.fan_nickname,
    xTag: r.x_tag,
  };
}

// ── 공개 답장 모음 (INV-G7) ──────────────────

export type WallReply = { phrase: ReplyPhrase; line: string | null; repliedOn: string; fanNickname: string | null };

const wallRow = z.object({ phrase, line: z.string().nullable(), replied_on: day, fan_nickname: z.string().nullable() }).strict();

/** 링크 페이지의 감사 답장 모음 — 양쪽이 동의하고 받았어요 3일이 지난 답장, 최신 20개. 로그인과 상관없다. */
export async function readReplyWall(client: Pick<SupabaseClient, "rpc">, creatorId: string): Promise<WallReply[]> {
  const { data, error } = await client.rpc("creator_reply_wall", { p_creator_id: creatorId });
  if (error) fail("답장 모음", error.code);
  return z
    .array(wallRow)
    .parse(data)
    .map((r) => ({ phrase: r.phrase, line: r.line, repliedOn: r.replied_on, fanNickname: r.fan_nickname }));
}

// ── 크리에이터 설정: 모음 보이기 · X 계정 · 태그 허용 ──────────────────

export type ReplySettings = { wallVisible: boolean; xHandle: string | null; xTagAllowed: boolean };

const settingsRow = z.object({ wall_visible: z.boolean(), x_handle: z.string().nullable(), x_tag_allowed: z.boolean() }).strict();

/** 로그인한 크리에이터 본인의 답장 설정. 크리에이터 줄이 없으면 null. */
export async function readMyReplySettings(client: Pick<SupabaseClient, "rpc">): Promise<ReplySettings | null> {
  const { data, error } = await client.rpc("my_reply_settings");
  if (error) fail("답장 설정", error.code);
  const [r] = z.array(settingsRow).max(1).parse(data);
  return r ? { wallVisible: r.wall_visible, xHandle: r.x_handle, xTagAllowed: r.x_tag_allowed } : null;
}
