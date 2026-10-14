import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ChannelBadge } from "../model/channel-badge";
import { isChannelPlatform } from "../model/channel-url";
import { isHandleShape, type ResolvedHandle } from "../model/creator-handle";

// 선물 링크 페이지 읽기 (creator-link). 응답은 신뢰 경계 밖이라 형식을 검사한다.
// - resolve_creator_handle: 공개 — 지금 아이디·묶인 옛 아이디로 크리에이터와 그 지금 아이디를 찾는다. 본인 확인 전·없는 아이디는 빈 목록(INV-E3·E5).
// - creator_month_fan_total: 공개 — 이번 달 마음을 보낸 서로 다른 팬 수, 숫자 하나(INV-E8).
// - my_creator_link: 로그인한 크리에이터 본인의 아이디·남은 잠금 날·사진 경로(INV-E4).
// - creator_link_extras: 공개 — 팬덤 이름과 확인된 채널(플랫폼·채널 키·주소·확인 날짜)만(추가분 4-1·4-3). 본인 확인 전·취소면 빈 목록.

const resolvedRow = z.object({ creator_id: z.guid(), handle: z.string() });

/** 주소에서 온 아이디로 크리에이터를 찾는다. 꼴이 틀리면 DB 를 부르지 않는다. */
export async function resolveCreatorHandle(client: Pick<SupabaseClient, "rpc">, handle: string): Promise<ResolvedHandle | null> {
  if (!isHandleShape(handle)) return null;
  const { data, error } = await client.rpc("resolve_creator_handle", { p_handle: handle });
  if (error) throw new Error(`링크 아이디를 찾지 못했다: ${error.code}`);
  const row = z.array(resolvedRow).parse(data)[0];
  return row ? { creatorId: row.creator_id, handle: row.handle } : null;
}

/** 이번 달(한국 시간) 결제가 끝난 선물을 보낸 서로 다른 팬 수. 본인 확인 전이면 0. */
export async function readCreatorMonthFans(client: Pick<SupabaseClient, "rpc">, creatorId: string): Promise<number> {
  const { data, error } = await client.rpc("creator_month_fan_total", { p_creator_id: creatorId });
  if (error) throw new Error(`이번 달 팬 수를 읽지 못했다: ${error.code}`);
  return z.number().int().nonnegative().parse(data);
}

export type MyCreatorLink = {
  handle: string | null;
  /** 다시 바꿀 수 있을 때까지 남은 날(0 이면 지금 바꿀 수 있다). */
  lockedDays: number;
  photoPath: string | null;
};

const myRow = z.object({
  handle: z.string().nullable(),
  handle_locked_days: z.number().int().nonnegative(),
  photo_path: z.string().nullable(),
});

/** 크리에이터 줄이 없으면 null. */
export async function readMyCreatorLink(client: Pick<SupabaseClient, "rpc">): Promise<MyCreatorLink | null> {
  const { data, error } = await client.rpc("my_creator_link");
  if (error) throw new Error(`내 링크 설정을 읽지 못했다: ${error.code}`);
  const row = z.array(myRow).parse(data)[0];
  return row ? { handle: row.handle, lockedDays: row.handle_locked_days, photoPath: row.photo_path } : null;
}

export type CreatorLinkExtras = {
  /** 팬을 부르는 이름 — 없으면 null(추가분 4-1) */
  fanName: string | null;
  /** 확인된 채널 — 플랫폼이 비었거나 모르는 값이면 null(추가분 4-3) */
  channel: ChannelBadge | null;
};

const extrasRow = z.object({
  fan_name: z.string().nullable(),
  platform: z.string().nullable(),
  channel_key: z.string().nullable(),
  channel_url: z.string().nullable(),
  verified_on: z.iso.date().nullable(),
});

const NO_EXTRAS: CreatorLinkExtras = { fanName: null, channel: null };

/** 공개 읽기 — 크리에이터 ID 꼴이 아니면 DB 를 부르지 않는다. 본인 확인 전·없는 크리에이터는 둘 다 null. */
export async function readCreatorLinkExtras(client: Pick<SupabaseClient, "rpc">, creatorId: string): Promise<CreatorLinkExtras> {
  if (!z.guid().safeParse(creatorId).success) return NO_EXTRAS;
  const { data, error } = await client.rpc("creator_link_extras", { p_creator_id: creatorId });
  if (error) throw new Error(`링크 페이지 공개 정보를 읽지 못했다: ${error.code}`);
  const row = z.array(extrasRow).parse(data)[0];
  if (!row) return NO_EXTRAS;
  const { platform, channel_key: channelKey, channel_url: channelUrl } = row;
  const channel =
    platform && isChannelPlatform(platform) && channelKey && channelUrl?.startsWith("https://")
      ? { platform, channelKey, channelUrl, verifiedOn: row.verified_on }
      : null;
  return { fanName: row.fan_name?.trim() || null, channel };
}
