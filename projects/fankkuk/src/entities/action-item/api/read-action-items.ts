import type { SupabaseClient } from "@supabase/supabase-js";
import { parseActionItems, type ActionItem } from "../model/action-items";
import { z } from "zod";
import { parseCreatorActionItems, withSignatureLinkItem, type CreatorActionItem } from "../model/creator-action-items";

// 처리할 일 읽기(action-center INV-J2·J3) — 로그인한 사람의 토큰으로 DB 읽기 함수를 부른다. 계정 인자는 없다(누구 것인지는 DB 가 auth.uid() 로 정한다).
// 한 화면에서 한 번만 부르고 그 결과를 사이드바 숫자와 본문에 함께 넘긴다.
export async function readActionItems(client: Pick<SupabaseClient, "rpc">): Promise<ActionItem[]> {
  const { data, error } = await client.rpc("my_action_items");
  if (error) throw new Error(`처리할 일을 읽지 못했다: ${error.code}`);
  return parseActionItems(data);
}

/**
 * 숫자만 곁들이는 화면(사이드바 뱃지·홈 한 줄·선물 상세 맨 위 한 줄)용 — 못 읽으면 null 을 주고 화면은 그대로 그린다.
 * null 이면 뱃지와 한 줄이 모두 빠진다(서로 다른 수를 말하지 않는다). 처리할 일 화면 자체는 readActionItems 로 실패를 드러낸다.
 */
export async function readActionItemsOrNull(client: Pick<SupabaseClient, "rpc">): Promise<ActionItem[] | null> {
  try {
    return await readActionItems(client);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "처리할 일을 읽지 못했다");
    return null;
  }
}

/**
 * 크리에이터 처리할 일 읽기(action-center INV-J5·J6·J7) — 인자 없이 로그인 토큰의 크리에이터 것만. 한 화면에서 한 번 부르고
 * 그 결과를 사이드바 숫자·홈 한 줄·처리할 일 목록에 함께 넘긴다(숫자는 줄 수 — 따로 세지 않는다).
 */
export async function readCreatorActionItems(client: Pick<SupabaseClient, "rpc">): Promise<CreatorActionItem[]> {
  // 승인 서명 연결 줄(signup INV-U20 · approval-signature INV-S16)도 같은 읽기에 넣는다 — 숫자가 따로 세어지지 않게(J6).
  // 연결 여부를 못 읽으면 줄을 지어내지도 빼지도 않고 목록 전체를 실패로 둔다(숫자와 한 줄이 함께 빠진다)
  const [rows, link] = await Promise.all([client.rpc("my_creator_action_items"), client.rpc("my_signature_link")]);
  if (rows.error) throw new Error(`크리에이터 처리할 일을 읽지 못했다: ${rows.error.code}`);
  if (link.error) throw new Error(`승인 서명 연결 여부를 읽지 못했다: ${link.error.code}`);
  const linked = linkRow.parse(Array.isArray(link.data) ? link.data[0] : link.data).linked;
  return withSignatureLinkItem(parseCreatorActionItems(rows.data), linked);
}

const linkRow = z.object({ linked: z.boolean() });

/** 숫자만 곁들이는 화면(사이드바·홈)용 — 못 읽으면 null(뱃지와 한 줄이 함께 빠진다) */
export async function readCreatorActionItemsOrNull(client: Pick<SupabaseClient, "rpc">): Promise<CreatorActionItem[] | null> {
  try {
    return await readCreatorActionItems(client);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "크리에이터 처리할 일을 읽지 못했다");
    return null;
  }
}
