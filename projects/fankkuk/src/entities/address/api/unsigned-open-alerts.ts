import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 승인 서명 없이 열린 주소 열람 줄 경보 (creator-link INV-E11). 운영자만 읽는다 — 운영자가 아니면 DB 가 빈 목록을 돌려준다.
// 줄 내용(주문·크리에이터)은 돌려주지 않고 수와 마지막 시각만 — 경보가 뜨면 운영자가 열람 기록에서 확인한다.

export type UnsignedOpenAlert = { openRows: number; latestAt: string | null };

const row = z.object({ open_rows: z.number().int().nonnegative(), latest_at: z.string().nullable() });

export async function readUnsignedOpenAlerts(client: Pick<SupabaseClient, "rpc">): Promise<UnsignedOpenAlert> {
  const { data, error } = await client.rpc("admin_unsigned_open_alerts");
  if (error) throw new Error(`열람 경보를 읽지 못했다: ${error.code}`);
  const r = z.array(row).parse(data)[0];
  return { openRows: r?.open_rows ?? 0, latestAt: r?.latest_at ?? null };
}
