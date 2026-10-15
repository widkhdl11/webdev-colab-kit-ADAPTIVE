import type { SupabaseClient } from "@supabase/supabase-js";
import { toFanProfile, type FanProfile } from "../model/fan-profile";

/** 팬 프로필 네 칸(DB 함수 fan_profile — 누구나 부른다, my-account INV-A13). 팬이 아니거나 못 읽으면 null. */
export async function readFanProfile(client: Pick<SupabaseClient, "rpc">, profileId: string): Promise<FanProfile | null> {
  const { data, error } = await client.rpc("fan_profile", { p_profile_id: profileId });
  if (error || !Array.isArray(data)) return null;
  return toFanProfile(data[0]);
}
