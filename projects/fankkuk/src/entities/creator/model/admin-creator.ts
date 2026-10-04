import { z } from "zod";

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

export const VERIFICATION_ACTIONS = ["approve", "revoke"] as const;
export type VerificationAction = (typeof VERIFICATION_ACTIONS)[number];

export type VerificationEvent = {
  at: string;
  actorNickname: string;
  creatorId: string;
  creatorName: string;
  action: VerificationAction;
  reason: string;
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
  }));
}
