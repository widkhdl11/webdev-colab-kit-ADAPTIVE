import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 운영자 크리에이터 목록의 가린 번호(admin-console INV-K14) — 직원·대표 모두 앞 3자리-****-뒤 4자리만 받는다.
// 가린 꼴이 아닌 값이 오면 쓰지 않고 던진다(가운데가 보이는 번호가 화면에 나가지 않게). 원래 번호는 대표의 「전화번호 보기」로만.

const MASKED = /^01[016789]-\*{4}-[0-9]{4}$/;
const maskRow = z.object({ login_id: z.string(), phone_masked: z.string().regex(MASKED) });

/** 크리에이터 아이디 → 가린 번호. 번호가 없는 크리에이터·크리에이터가 아닌 계정은 빠진다. 한 번에 200개까지(DB 한도). */
export async function readAdminPhoneMasks(client: Pick<SupabaseClient, "rpc">, loginIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(loginIds)].slice(0, 200);
  if (ids.length === 0) return new Map();
  const { data, error } = await client.rpc("admin_phone_masks", { p_login_ids: ids });
  if (error) throw new Error(`가린 번호를 읽지 못했다: ${error.code}`);
  return new Map(z.array(maskRow).parse(data).map((r) => [r.login_id, r.phone_masked]));
}
