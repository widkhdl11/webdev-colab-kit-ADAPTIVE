import { z } from "zod";
import { VERIFICATION_METHODS, type VerificationMethod } from "./creator-verification";

// 관리자 「크리에이터 확인」 화면이 읽는 줄 (admin-console INV-K10·K8). 사람은 닉네임·아이디로만 나온다.
// 꼴이 다른 줄이 하나라도 있으면 null — 처리 기록이 몰래 빠지지 않게.

export type AdminCreator = {
  id: string;
  slug: string;
  name: string;
  channel: string;
  channelTitle: string;
  /** 크리에이터 계정이 아직 없으면 null */
  loginId: string | null;
  verified: boolean;
  /** 마지막 승인·취소 시각과 한 사람. 처리한 적이 없으면 null */
  lastActionAt: string | null;
  lastActorNickname: string | null;
};

// creator-verification INV-V6·V9·V13·V14: 승인·반려·닫힘(다른 계정의 로그인 확인)·승인 취소
export const VERIFICATION_ACTIONS = ["approve", "reject", "close", "revoke"] as const;
export type VerificationAction = (typeof VERIFICATION_ACTIONS)[number];

export type VerificationEvent = {
  at: string;
  actorNickname: string;
  creatorId: string;
  creatorName: string;
  action: VerificationAction;
  /** 운영자 메모(운영자만 본다, INV-V9). 없으면 "" */
  reason: string;
  /** 사유 목록 값 — 반려·닫힘·취소. 승인이나 옛 기록이면 null */
  reasonCode: string | null;
  /** 확인 방법(INV-V13). 옛 기록이면 null */
  method: VerificationMethod | null;
  /** 그때의 채널 주소·코드(INV-V6). 옛 기록·로그인 확인이면 null */
  channelUrl: string | null;
  code: string | null;
};

const creatorRow = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  channel: z.string(),
  channel_title: z.string(),
  login_id: z.string().nullable(),
  verified: z.boolean(),
  last_action_at: z.string().nullable(),
  last_actor_nickname: z.string().nullable(),
});

const eventRow = z.object({
  at: z.string(),
  actor_nickname: z.string(),
  creator_id: z.string(),
  creator_name: z.string(),
  action: z.enum(VERIFICATION_ACTIONS),
  reason: z.string(),
  reason_code: z.string().nullable(),
  method: z.enum(VERIFICATION_METHODS).nullable(),
  channel_url: z.string().nullable(),
  code: z.string().nullable(),
});

export function adminCreatorsFromRows(rows: unknown): AdminCreator[] | null {
  const parsed = z.array(creatorRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    channel: r.channel,
    channelTitle: r.channel_title,
    loginId: r.login_id,
    verified: r.verified,
    lastActionAt: r.last_action_at,
    lastActorNickname: r.last_actor_nickname,
  }));
}

export function verificationEventsFromRows(rows: unknown): VerificationEvent[] | null {
  const parsed = z.array(eventRow).safeParse(rows);
  if (!parsed.success) return null;
  return parsed.data.map((r) => ({
    at: r.at,
    actorNickname: r.actor_nickname,
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    action: r.action,
    reason: r.reason,
    reasonCode: r.reason_code,
    method: r.method,
    channelUrl: r.channel_url,
    code: r.code,
  }));
}

/**
 * 크리에이터마다 가장 최근 승인 기록(누가·언제). 승인된 크리에이터 표의 「승인한 사람」 칸 — 마지막 처리가 이사 신청의 반려일 수 있어
 * 마지막 처리 한 줄(lastActionAt) 대신 승인 줄만 본다. 기록은 최근 것부터 온다.
 */
export function latestApprovals(events: readonly VerificationEvent[]): Map<string, { at: string; actorNickname: string }> {
  const out = new Map<string, { at: string; actorNickname: string }>();
  for (const e of events) {
    if (e.action === "approve" && !out.has(e.creatorId)) out.set(e.creatorId, { at: e.at, actorNickname: e.actorNickname });
  }
  return out;
}
