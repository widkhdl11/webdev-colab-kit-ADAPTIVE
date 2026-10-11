import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { toCreatorCards, type CreatorCard } from "../model/creator-card";
import type { CreatorProfile, CreatorSummary } from "../model/creator";

// 크리에이터 목록을 DB 읽기 함수(find_creators·list_creators·creator_by_id, 팔로우는 my_follows)로 읽는다. 응답은 신뢰 경계 밖이라 형식을 검사한다.

const rowSchema = z.object({
  id: z.guid(),
  name: z.string(),
  channel: z.string(),
  channel_title: z.string(),
  tags: z.array(z.string()),
  intro: z.string(),
  alias: z.string(),
  avg_approval_hours: z.number().int().nullable(),
  face_tone: z.string(),
  approval_minutes_from_orders: z.number().int().nullable(),
  // creator-link: 링크용 아이디·사진 경로(아이디나 사진이 없으면 null)
  handle: z.string().nullable(),
  photo_path: z.string().nullable(),
});

const followSchema = z.object({ creator_id: z.guid() });

/**
 * 본인 확인을 마친 크리에이터 카드. 로그인한 팬이면 팔로우 여부가 붙는다.
 * forSearch = 크리에이터 찾기 목록 — 「본인 확인됨 그리고 찾기 노출 켜짐」만(find_creators, my-account INV-A10).
 * 그 밖의 목록(메인·선물 보내기·팔로우 목록)은 노출 켜짐 + 내가 팔로우한 사람 + 나 자신(list_creators, INV-A10 S10b).
 * onlyId = 페이지 주소로 여는 한 명 — 노출과 상관없이 본인 확인됨이면 나온다(creator_by_id). 없으면 빈 배열.
 */
export async function readCreatorCards(
  client: Pick<SupabaseClient, "rpc">,
  opts: { signedIn: boolean; forSearch?: boolean; onlyId?: string },
): Promise<CreatorCard[]> {
  // 주소에서 온 값이라 꼴부터 본다 — ID 꼴이 아니면 DB 가 오류를 내 페이지가 500 이 된다
  if (opts.onlyId !== undefined && !z.guid().safeParse(opts.onlyId).success) return [];
  const { data, error } = opts.onlyId
    ? await client.rpc("creator_by_id", { p_id: opts.onlyId })
    : await client.rpc(opts.forSearch ? "find_creators" : "list_creators");
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
    tags: r.tags,
    channelTitle: r.channel_title,
    intro: r.intro,
    alias: r.alias,
    avgApprovalHours: r.avg_approval_hours,
    faceTone: r.face_tone,
    handle: r.handle,
    photoPath: r.photo_path,
  }));
  const minutes = Object.fromEntries(rows.map((r) => [r.id, r.approval_minutes_from_orders]));
  return toCreatorCards(summaries, profiles, followedIds, minutes);
}

const creatorIdSchema = z.object({ creator_id: z.guid() });

/** 로그인한 크리에이터 자신의 크리에이터 id(없으면 null). 자기 줄·자기 페이지에서 팔로우·선물 보내기를 숨기는 데 쓴다. */
export async function readOwnCreatorId(client: Pick<SupabaseClient, "rpc">): Promise<string | null> {
  const own = await client.rpc("my_creator_id");
  if (own.error) throw new Error(`내 크리에이터 id 를 읽지 못했다: ${own.error.code}`);
  return z.array(creatorIdSchema).parse(own.data)[0]?.creator_id ?? null;
}

/** 로그인한 사람이 팔로우한 크리에이터 id, 팔로우한 순서(오래된 것부터 — my_follows). 로그인하지 않았으면 부르지 않는다. */
export async function readMyFollowIds(client: Pick<SupabaseClient, "rpc">): Promise<string[]> {
  const r = await client.rpc("my_follows");
  if (r.error) throw new Error(`팔로우 목록을 읽지 못했다: ${r.error.code}`);
  return z.array(followSchema).parse(r.data).map((f) => f.creator_id);
}
