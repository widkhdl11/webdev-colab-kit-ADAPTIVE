import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";
import { PARCEL_TIERS, type OfficeTier } from "./office-parcel";
import { QR_PATTERN } from "./scan-code";

// 관리자 사무실 목록들의 줄 (office-workflow INV-W2·W3·W5·W6·W7). 꼴이 다른 줄이 하나라도 있으면 null.
// 사람은 닉네임·크리에이터 이름으로만, 미확인 입고의 보낸 사람은 앞 한 글자만(INV-W7).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ── 미확인 입고 (INV-W5) ──

export const UNMATCHED_STATES = ["waiting", "matched", "expired"] as const;
export type UnmatchedState = (typeof UNMATCHED_STATES)[number];

export type UnmatchedParcel = {
  id: string;
  waybillNo: string;
  arrivedAt: string;
  senderInitial: string;
  shelf: string;
  state: UnmatchedState;
  deadlineAt: string;
  matchedOrderNo: string | null;
};

const unmatchedRow = z.object({
  id: z.string(),
  waybill_no: z.string(),
  arrived_at: z.string(),
  sender_initial: z.string().refine((s) => charCount(s) === 1),
  shelf: z.string(),
  state: z.enum(UNMATCHED_STATES),
  deadline_at: z.string(),
  matched_order_no: z.string().nullable(),
});

export function unmatchedFromRows(rows: unknown): UnmatchedParcel[] | null {
  const parsed = z.array(unmatchedRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    id: r.id,
    waybillNo: r.waybill_no,
    arrivedAt: r.arrived_at,
    senderInitial: r.sender_initial,
    shelf: r.shelf,
    state: r.state,
    deadlineAt: r.deadline_at,
    matchedOrderNo: r.matched_order_no,
  }));
}

/** INV-W6: 기한(도착 + 168시간)까지 남은 날 — 올림. 지났으면 0. */
export function daysLeft(deadlineIso: string, now: Date): number {
  const ms = Date.parse(deadlineIso) - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / DAY_MS);
}

/** 미확인 입고 「곧 처리」 — 남은 날이 1일 이하. */
export const UNMATCHED_URGENT_DAYS = 1;
export function isUnmatchedUrgent(left: number): boolean {
  return left <= UNMATCHED_URGENT_DAYS;
}

// ── 자동 처리 예정 (INV-W6) ──

// unpaid: 만든 지 24시간 지난 결제 대기(payment INV-M15 · reverse-gift INV-R15) — 처리하면 결제 실패로 닫힌다.
export const EXPIRY_CATEGORIES = ["gift", "revgift", "difference", "unpaid"] as const;
export type ExpiryCategory = (typeof EXPIRY_CATEGORIES)[number];

export type ExpiryDue = {
  category: ExpiryCategory;
  orderNo: string;
  senderNickname: string;
  receiverName: string;
  dueAt: string;
  detail: string | null;
};

const dueRow = z.object({
  category: z.enum(EXPIRY_CATEGORIES),
  order_no: z.string(),
  sender_nickname: z.string(),
  receiver_name: z.string(),
  due_at: z.string(),
  detail: z.string().nullable(),
});

export function expiryDueFromRows(rows: unknown): ExpiryDue[] | null {
  const parsed = z.array(dueRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    category: r.category,
    orderNo: r.order_no,
    senderNickname: r.sender_nickname,
    receiverName: r.receiver_name,
    dueAt: r.due_at,
    detail: r.detail,
  }));
}

/** 기한까지 남은 시간(「13시간」「1일 13시간」「1시간 안」) 또는 지난 시간(「지남」「2일 지남」). */
export function remainingText(dueIso: string, now: Date): string {
  const ms = Date.parse(dueIso) - now.getTime();
  if (ms <= 0) {
    const days = Math.floor(-ms / DAY_MS);
    return days === 0 ? "지남" : `${days}일 지남`;
  }
  const hours = Math.floor(ms / HOUR_MS);
  if (hours === 0) return "1시간 안";
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  if (d === 0) return `${h}시간`;
  return h === 0 ? `${d}일` : `${d}일 ${h}시간`;
}

/** 기한이 지났나(past) · 24시간 안인가(soon) · 그 밖(normal). */
export function dueUrgency(dueIso: string, now: Date): "past" | "soon" | "normal" {
  const ms = Date.parse(dueIso) - now.getTime();
  if (ms <= 0) return "past";
  return ms < DAY_MS ? "soon" : "normal";
}

// ── 역조공 몫 (INV-W3·W6, reverse-gift INV-R10·R11) ──

export const SHARE_REPLIES = ["waiting", "accepted", "declined", "expired"] as const;
export type ShareReply = (typeof SHARE_REPLIES)[number];
export const SHARE_REFUND_STATUSES = ["requesting", "done", "failed"] as const;
export type ShareRefundStatus = (typeof SHARE_REFUND_STATUSES)[number];

export type RevgiftShare = {
  shareId: string;
  orderNo: string;
  creatorName: string;
  fanNickname: string;
  tier: OfficeTier;
  reply: ShareReply;
  deadlineAt: string;
  receivedAt: string | null;
  refundStatus: ShareRefundStatus | null;
};

const shareRow = z.object({
  share_id: z.string(),
  order_no: z.string(),
  creator_name: z.string(),
  fan_nickname: z.string(),
  tier: z.enum(PARCEL_TIERS),
  reply: z.enum(SHARE_REPLIES),
  deadline_at: z.string(),
  received_at: z.string().nullable(),
  refund_status: z.enum(SHARE_REFUND_STATUSES).nullable(),
});

export function revgiftSharesFromRows(rows: unknown): RevgiftShare[] | null {
  const parsed = z.array(shareRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    shareId: r.share_id,
    orderNo: r.order_no,
    creatorName: r.creator_name,
    fanNickname: r.fan_nickname,
    tier: r.tier,
    reply: r.reply,
    deadlineAt: r.deadline_at,
    receivedAt: r.received_at,
    refundStatus: r.refund_status,
  }));
}

// ── 이 작업자의 부착 대기 라벨 (INV-W2 — 작업자별 한 칸) ──

export type PendingLabel = { qr: string; orderNo: string };

const pendingRow = z.object({ qr: z.string().regex(QR_PATTERN), order_no: z.string() });

/** 0줄 = 없음, 1줄 = 그 라벨. 두 줄 이상이면 DB 의 「작업자별 한 칸」이 깨진 것이라 실패로 본다. */
export function pendingLabelFromRows(rows: unknown): { ok: true; pending: PendingLabel | null } | { ok: false } {
  const parsed = z.array(pendingRow).max(1).safeParse(rows);
  if (!parsed.success) return { ok: false };
  const row = parsed.data[0];
  return { ok: true, pending: row ? { qr: row.qr, orderNo: row.order_no } : null };
}
