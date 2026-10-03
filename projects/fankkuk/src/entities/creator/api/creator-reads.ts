import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { toCreatorCards, type CreatorCard } from "../model/creator-card";
import type { CreatorProfile, CreatorSummary } from "../model/creator";

// 크리에이터 목록을 DB 읽기 함수(list_creators·my_follows)로 읽는다. 응답은 신뢰 경계 밖이라 형식을 검사한다.

const rowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  channel: z.string(),
  channel_title: z.string(),
  category: z.string(),
  intro: z.string(),
  alias: z.string(),
  avg_approval_hours: z.number().int().nullable(),
  face_tone: z.string(),
  approval_minutes_from_orders: z.number().int().nullable(),
});

const followSchema = z.object({ creator_id: z.string().uuid() });

/** 본인 확인을 마친 크리에이터 카드. 로그인한 팬이면 팔로우 여부가 붙는다. */
export async function readCreatorCards(client: Pick<SupabaseClient, "rpc">, opts: { signedIn: boolean }): Promise<CreatorCard[]> {
  const { data, error } = await client.rpc("list_creators");
  if (error) throw new Error(`크리에이터 목록을 읽지 못했다: ${error.code}`);
  const rows = z.array(rowSchema).parse(data);

  let followedIds: string[] = [];
  if (opts.signedIn) {
    const follows = await client.rpc("my_follows");
    if (follows.error) throw new Error(`팔로우 목록을 읽지 못했다: ${follows.error.code}`);
    followedIds = z.array(followSchema).parse(follows.data).map((f) => f.creator_id);
  }

  const summaries: CreatorSummary[] = rows.map((r) => ({ id: r.id, name: r.name, channel: r.channel }));
  const profiles: CreatorProfile[] = rows.map((r) => ({
    creatorId: r.id,
    category: r.category,
    channelTitle: r.channel_title,
    intro: r.intro,
    alias: r.alias,
    avgApprovalHours: r.avg_approval_hours ?? 0,
    faceTone: r.face_tone,
  }));
  const minutes = Object.fromEntries(rows.map((r) => [r.id, r.approval_minutes_from_orders]));
  return toCreatorCards(summaries, profiles, followedIds, minutes);
}

const creatorIdSchema = z.object({ creator_id: z.string().uuid() });

/** 로그인한 크리에이터 자신의 크리에이터 id(없으면 null). 자기 줄·자기 페이지에서 팔로우·선물 보내기를 숨기는 데 쓴다. */
export async function readOwnCreatorId(client: Pick<SupabaseClient, "rpc">): Promise<string | null> {
  const own = await client.rpc("my_creator_id");
  if (own.error) throw new Error(`내 크리에이터 id 를 읽지 못했다: ${own.error.code}`);
  return z.array(creatorIdSchema).parse(own.data)[0]?.creator_id ?? null;
}
