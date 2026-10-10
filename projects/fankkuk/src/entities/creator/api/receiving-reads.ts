import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CreatorReceiving, MyCreatorReceiving } from "../model/receiving";

// 크리에이터 받는 양 조절 읽기 (creator-receiving). 응답은 신뢰 경계 밖이라 형식을 검사한다.
// - creator_receiving: 공개 — 쉬는 중 날짜·생일·기념일. 한도 칸은 없다(INV-B6).
// - my_gift_limit_reached: 로그인한 보내는 사람 본인이 이번 달 한도에 닿은 크리에이터 id 만(INV-B6). 다른 사람 ID 를 넣을 칸이 없다.
// - my_creator_receiving: 로그인한 크리에이터 본인 설정(한도 포함).

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const anniversary = z.object({ name: z.string().min(1), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) });
const publicRow = z.object({
  id: z.guid(),
  resume_on: isoDate.nullable(),
  birthday_month: z.number().int().min(1).max(12).nullable(),
  birthday_day: z.number().int().min(1).max(31).nullable(),
  anniversaries: z.array(anniversary),
});
const myRow = publicRow.omit({ id: true }).extend({ monthly_limit: z.number().int().min(1).max(10).nullable() });

function birthdayOf(r: { birthday_month: number | null; birthday_day: number | null }) {
  return r.birthday_month !== null && r.birthday_day !== null ? { month: r.birthday_month, day: r.birthday_day } : null;
}

/** 크리에이터 id 별 공개 받는 상태. 본인 확인 전·없는 id 는 빠진다. */
export async function readCreatorReceiving(client: Pick<SupabaseClient, "rpc">, ids: readonly string[]): Promise<Map<string, CreatorReceiving>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await client.rpc("creator_receiving", { p_ids: ids });
  if (error) throw new Error(`받는 상태를 읽지 못했다: ${error.code}`);
  return new Map(
    z
      .array(publicRow)
      .parse(data)
      .map((r) => [r.id, { resumeOn: r.resume_on, birthday: birthdayOf(r), anniversaries: r.anniversaries }]),
  );
}

/** 로그인한 사람이 이번 달 한도에 닿은 크리에이터 id. 로그인하지 않았으면 부르지 않는다(빈 목록). */
export async function readMyLimitReached(client: Pick<SupabaseClient, "rpc">, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.rpc("my_gift_limit_reached", { p_creator_ids: ids });
  if (error) throw new Error(`한도 판정을 읽지 못했다: ${error.code}`);
  return z.array(z.guid()).parse(data);
}

/** 로그인한 크리에이터 본인 설정. 크리에이터 줄이 없으면 null. */
export async function readMyCreatorReceiving(client: Pick<SupabaseClient, "rpc">): Promise<MyCreatorReceiving | null> {
  const { data, error } = await client.rpc("my_creator_receiving");
  if (error) throw new Error(`받는 양 설정을 읽지 못했다: ${error.code}`);
  const r = z.array(myRow).parse(data)[0];
  if (!r) return null;
  return { resumeOn: r.resume_on, monthlyLimit: r.monthly_limit, birthday: birthdayOf(r), anniversaries: r.anniversaries };
}
