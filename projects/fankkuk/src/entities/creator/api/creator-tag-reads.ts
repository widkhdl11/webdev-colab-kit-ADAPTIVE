import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AdminTagOption, BannedWord, CustomTagCount, TagOption } from "../model/creator-tags";

// 크리에이터 태그 읽기 (creator-tags INV-T1·T4·T5). 응답은 신뢰 경계 밖이라 형식을 검사한다.
// - 고를 수 있는 선택지(creator_tag_options) — 숨기지 않은 것, 선택지 순서. 로그인하지 않아도 읽는다(가입 화면).
// - 운영자 선택지 목록·직접 입력 목록 — DB 가 운영자가 아니면 빈 목록을 준다.

const optionRow = z.object({ id: z.guid(), name: z.string() });
const adminOptionRow = z.object({ id: z.guid(), name: z.string(), hidden: z.boolean(), creator_count: z.number().int() });
const customRow = z.object({ tag: z.string(), creator_count: z.number().int() });
const bannedRow = z.object({ id: z.guid(), word: z.string() });

export async function readTagOptions(client: Pick<SupabaseClient, "rpc">): Promise<TagOption[]> {
  const { data, error } = await client.rpc("creator_tag_options");
  if (error) throw new Error(`태그 선택지를 읽지 못했다: ${error.code}`);
  return z.array(optionRow).parse(data);
}

/** 운영자 화면 — 숨긴 선택지까지, 선택지 순서. client 는 로그인한 운영자의 세션 클라이언트. */
export async function readAdminTagOptions(client: Pick<SupabaseClient, "rpc">): Promise<AdminTagOption[]> {
  const { data, error } = await client.rpc("admin_creator_tag_options");
  if (error) throw new Error(`태그 선택지 목록을 읽지 못했다: ${error.code}`);
  return z.array(adminOptionRow).parse(data).map((r) => ({ id: r.id, name: r.name, hidden: r.hidden, creatorCount: r.creator_count }));
}

/** 운영자 화면 — 태그 금칙어(INV-T7·T8), 가나다순. 운영자가 아니면 DB 가 거부한다. */
export async function readBannedWords(client: Pick<SupabaseClient, "rpc">): Promise<BannedWord[]> {
  const { data, error } = await client.rpc("admin_tag_banned_words");
  if (error) throw new Error(`태그 금칙어를 읽지 못했다: ${error.code}`);
  return z.array(bannedRow.passthrough()).parse(data).map((r) => ({ id: r.id, word: r.word }));
}

/** 운영자 화면 — 크리에이터가 직접 입력한 태그를 같은 말끼리 묶은 인원수(많은 것부터). */
export async function readCustomTags(client: Pick<SupabaseClient, "rpc">): Promise<CustomTagCount[]> {
  const { data, error } = await client.rpc("admin_custom_creator_tags");
  if (error) throw new Error(`직접 입력한 태그를 읽지 못했다: ${error.code}`);
  return z.array(customRow).parse(data).map((r) => ({ tag: r.tag, creatorCount: r.creator_count }));
}
