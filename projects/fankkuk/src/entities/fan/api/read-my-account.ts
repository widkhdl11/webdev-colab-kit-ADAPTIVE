import type { SupabaseClient } from "@supabase/supabase-js";
import { toMyAccount, type MyAccount } from "../model/my-account";

/** 로그인한 사람 자기 내 정보(DB 함수 my_account — 사람은 로그인 토큰으로 정해진다, INV-A3). 못 읽으면 null.
 *  「바로 받기」(my_notification_instant, notification-batching INV-NB5)도 같이 읽는다 — 행이 없으면 DB 가 false 를 준다. */
export async function readMyAccount(client: Pick<SupabaseClient, "rpc">): Promise<MyAccount | null> {
  const [account, instant] = await Promise.all([client.rpc("my_account"), client.rpc("my_notification_instant")]);
  if (account.error || instant.error || !Array.isArray(account.data)) return null;
  return toMyAccount(account.data[0], instant.data);
}
