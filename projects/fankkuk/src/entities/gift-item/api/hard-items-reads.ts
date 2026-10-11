import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { HARD_ACTIONS, HARD_PERIODS, HARD_REASONS, type HardItems, type MyHardItems } from "../model/hard-items";
import { ITEM_CATEGORIES } from "../model/item-category";

// 받기 어려운 품목 읽기 (hard-items). 응답은 신뢰 경계 밖이라 형식을 검사한다.
// - creator_hard_items: 공개 — 살아 있는 설정의 품목·이유·동작만. 끝나는 날 칸은 없다(INV-H6).
// - my_creator_hard_items: 로그인한 크리에이터 본인의 살아 있는 설정(기간·끝나는 날 포함).

const base = {
  categories: z.array(z.enum(ITEM_CATEGORIES)).min(1).max(ITEM_CATEGORIES.length),
  reason: z.enum(HARD_REASONS),
  action: z.enum(HARD_ACTIONS),
};
const publicRow = z.object({ id: z.guid(), ...base });
const myRow = z.object({ ...base, period: z.enum(HARD_PERIODS), ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() });

/** 크리에이터 id 별 살아 있는 받기 어려운 품목. 설정이 없거나 끝났거나 본인 확인 전이면 빠진다. */
export async function readCreatorHardItems(client: Pick<SupabaseClient, "rpc">, ids: readonly string[]): Promise<Map<string, HardItems>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.rpc("creator_hard_items", { p_ids: ids });
  if (error) throw new Error(`받기 어려운 품목을 읽지 못했다: ${error.code}`);
  return new Map(
    z
      .array(publicRow)
      .parse(data)
      .map((r) => [r.id, { categories: r.categories, reason: r.reason, action: r.action }]),
  );
}

/** 로그인한 크리에이터 본인의 살아 있는 설정. 없거나 끝났으면 null. */
export async function readMyHardItems(client: Pick<SupabaseClient, "rpc">): Promise<MyHardItems | null> {
  const { data, error } = await client.rpc("my_creator_hard_items");
  if (error) throw new Error(`받기 어려운 품목 설정을 읽지 못했다: ${error.code}`);
  const r = z.array(myRow).parse(data)[0];
  if (!r) return null;
  return { categories: r.categories, reason: r.reason, action: r.action, period: r.period, endsOn: r.ends_on };
}
