import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { addressLabelSchema, type AddressLabel } from "../model/address-label";

// 로그인한 팬의 받을 주소 상태(DB 읽기 함수 my_fan_address_status — address-protection INV-P16·P17, manual/0019).
// 함수는 로그인 토큰의 팬 줄만, 등록 여부·이름표·바꾼 시각만 돌려준다. 주소 값(암호문 포함)은 오지 않는다(INV-P9).
// 팬이 아니면 줄이 없다(null). 그 밖의 칸이 섞이면 받지 않는다.

export type MyFanAddressStatus = { registered: boolean; label: AddressLabel | null; updatedAt: string | null };

const rowSchema = z
  .object({
    registered: z.boolean(),
    label: addressLabelSchema.nullable(),
    updated_at: z.string().nullable(),
  })
  .strict();

export async function readMyFanAddressStatus(client: Pick<SupabaseClient, "rpc">): Promise<MyFanAddressStatus | null> {
  const { data, error } = await client.rpc("my_fan_address_status");
  if (error) throw new Error(`받을 주소 상태를 읽지 못했다: ${error.code}`);
  const row = z.array(rowSchema).max(1).parse(data)[0];
  return row ? { registered: row.registered, label: row.label, updatedAt: row.updated_at } : null;
}
