import type { SupabaseClient } from "@supabase/supabase-js";
import { toMyAccount, type MyAccount } from "../model/my-account";

/** 로그인한 사람 자기 내 정보(DB 함수 my_account — 사람은 로그인 토큰으로 정해진다, INV-A3). 못 읽으면 null. */
export async function readMyAccount(client: Pick<SupabaseClient, "rpc">): Promise<MyAccount | null> {
  const { data, error } = await client.rpc("my_account");
  if (error || !Array.isArray(data)) return null;
  return toMyAccount(data[0]);
}
