import { z } from "zod";
import { charCount } from "@/shared/lib/validation/char-count";
import { CARRIERS, type Carrier } from "./carrier";
import { PARCEL_TIERS, type OfficeTier } from "./office-parcel";
import { QR_PATTERN } from "./scan-code";

// 관리자 사무실 목록들의 줄 (office-workflow INV-W2·W3·W5·W6·W7). 꼴이 다른 줄이 하나라도 있으면 null.
// 사람은 닉네임·크리에이터 이름으로만, 미확인 입고의 보낸 사람은 앞 한 글자만(INV-W7).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ── 보류 상자 — 운영자 확인 목록 (INV-W5, inbound-address-code INV-C5·C8·C9) ──
// 두 갈래가 한 목록에 온다.
//   unmatched = 6자리로 이어지지 않아 보류로 들어온 상자(미확인 입고) — 선반에 있고, 7일 안에 이어지지 않으면 반송 대상.
//   parcel    = 주문에 묶여 있는데 출고를 멈춘 상자(같은 6자리·같은 송장번호 분쟁, 「제가 보낸 게 아니에요」, 주문에서 떼어 낸 상자).
// 칸은 도착 시각·원 송장 바코드·택배사·보류 사유·발신인 앞 한 글자(+ 선반·봉투 번호)뿐이다(INV-C9·W7). 주문번호·닉네임·6자리는 오지 않는다.

/** 보류 사유. 앞 일곱은 보류로 들어올 때(입고 함수), 뒤 둘은 묶인 상자가 멈출 때. */
export const HOLD_REASONS = [
  "no_code",
  "unknown_code",
  "void_code",
  "used_code",
  "code_dispute",
  "barcode_bound",
  "waybill_dispute",
  "not_mine",
  "detached",
] as const;
export type HoldReason = (typeof HOLD_REASONS)[number];

export const UNMATCHED_STATES = ["waiting", "matched", "expired", "on_hold"] as const;
export type UnmatchedState = (typeof UNMATCHED_STATES)[number];

export const HELD_SOURCES = ["unmatched", "parcel"] as const;
export type HeldSource = (typeof HELD_SOURCES)[number];

export type UnmatchedParcel = {
  id: string;
  source: HeldSource;
  /** 묶인 상자(parcel)의 내부 QR = 봉투 번호. 미확인 입고에는 없다. */
  qr: string | null;
  waybillNo: string | null;
  carrier: Carrier | null;
  arrivedAt: string | null;
  senderInitial: string | null;
  shelf: string | null;
  reason: HoldReason;
  suspectedTheft: boolean;
  state: UnmatchedState;
  /** 미확인 입고만 — 도착 + 168시간 */
  deadlineAt: string | null;
};

const unmatchedRow = z.object({
  id: z.string(),
  source: z.enum(HELD_SOURCES),
  qr: z.string().nullable(),
  waybill_no: z.string().nullable(),
  carrier: z.enum(CARRIERS).nullable(),
  arrived_at: z.string().nullable(),
  sender_initial: z
    .string()
    .refine((s) => charCount(s) === 1)
    .nullable(),
  shelf: z.string().nullable(),
  reason: z.enum(HOLD_REASONS),
  suspected_theft: z.boolean(),
  state: z.enum(UNMATCHED_STATES),
  deadline_at: z.string().nullable(),
});

export function unmatchedFromRows(rows: unknown): UnmatchedParcel[] | null {
  const parsed = z.array(unmatchedRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    id: r.id,
    source: r.source,
    qr: r.qr,
    waybillNo: r.waybill_no,
    carrier: r.carrier,
    arrivedAt: r.arrived_at,
    senderInitial: r.sender_initial,
    shelf: r.shelf,
    reason: r.reason,
    suspectedTheft: r.suspected_theft,
    state: r.state,
    deadlineAt: r.deadline_at,
  }));
}

/** 기다리지 않고 바로 넘길 수 있는 묶인 상자의 보류 사유 — 주인이 아니라고 했거나 이미 주문에서 떨어진 상자(INV-C9 S9c). */
const RETURN_ANYTIME: readonly HoldReason[] = ["not_mine", "detached"];

/**
 * 「반송으로 넘기기」를 누를 수 있는 줄(inbound-address-code INV-C9). DB 가 잠금 뒤 다시 판정한다 — 여기는 버튼을 그릴지만 정한다.
 * 미확인 입고는 대기 중이면. 주문에 묶인 보류 상자는 「아니에요」·떼어 낸 상자면 바로, 분쟁이면 기한(보류 + 168시간)이 지난 뒤.
 */
export function canReturnHeld(row: Pick<UnmatchedParcel, "source" | "state" | "reason" | "deadlineAt">, now: string): boolean {
  if (row.source === "unmatched") return row.state === "waiting";
  if (row.state !== "on_hold") return false;
  if (RETURN_ANYTIME.includes(row.reason)) return true;
  return row.deadlineAt !== null && Date.parse(row.deadlineAt) <= Date.parse(now);
}

// ── 찾기 실패가 반복된 계정 (inbound-address-code INV-C10) ──

export type FindFlag = { nickname: string; failures24h: number; lastFlaggedAt: string };

const findFlagRow = z.object({ nickname: z.string(), failures_24h: z.number().int().min(0), last_flagged_at: z.string() });

export function findFlagsFromRows(rows: unknown): FindFlag[] | null {
  const parsed = z.array(findFlagRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({ nickname: r.nickname, failures24h: r.failures_24h, lastFlaggedAt: r.last_flagged_at }));
}

// ── 측정 숫자 (inbound-address-code 「측정」 절 — 최근 30일) ──

export type InboundMetrics = {
  since: string;
  arrivedTotal: number;
  arrivedWithoutCode: number;
  codeInputs: number;
  codeCheckRejects: number;
  codeFormatRejects: number;
  notMineReports: number;
};

const count = z.number().int().min(0);
const metricsRow = z.object({
  since: z.string(),
  arrived_total: count,
  arrived_without_code: count,
  code_inputs: count,
  code_check_rejects: count,
  code_format_rejects: count,
  not_mine_reports: count,
});

/** 한 줄짜리 답. 운영자가 아니면 DB 가 0줄을 준다 — 그때도 null. */
export function inboundMetricsFromRows(rows: unknown): InboundMetrics | null {
  const parsed = z.array(metricsRow).length(1).safeParse(rows);
  if (!parsed.success) return null;
  const r = parsed.data[0];
  return {
    since: r.since,
    arrivedTotal: r.arrived_total,
    arrivedWithoutCode: r.arrived_without_code,
    codeInputs: r.code_inputs,
    codeCheckRejects: r.code_check_rejects,
    codeFormatRejects: r.code_format_rejects,
    notMineReports: r.not_mine_reports,
  };
}

/** 비율(%) — 분모가 0이면 null(「아직 없음」). 소수 첫째 자리까지. */
export function ratePercent(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
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
