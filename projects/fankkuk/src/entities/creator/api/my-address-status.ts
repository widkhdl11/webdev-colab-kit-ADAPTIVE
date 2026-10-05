import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 로그인한 크리에이터의 주소 등록 여부(DB 읽기 함수 my_creator_address_status — address-protection INV-P13).
// 함수는 로그인 토큰의 크리에이터 줄만, 크리에이터 ID 와 등록 여부만 돌려준다. 주소 값(암호문 포함)은 오지 않는다(INV-P9).
// 크리에이터 ID 는 브라우저가 봉인할 내용에 넣는다(INV-P13).

export type MyAddressStatus = { creatorId: string; registered: boolean };

const rowSchema = z.object({ creator_id: z.string().uuid(), registered: z.boolean() }).strict();

export async function readMyAddressStatus(client: Pick<SupabaseClient, "rpc">): Promise<MyAddressStatus | null> {
  const { data, error } = await client.rpc("my_creator_address_status");
  if (error) throw new Error(`주소 등록 여부를 읽지 못했다: ${error.code}`);
  const row = z.array(rowSchema).max(1).parse(data)[0];
  return row ? { creatorId: row.creator_id, registered: row.registered } : null;
}
