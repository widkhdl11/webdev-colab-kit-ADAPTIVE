import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

// 팬꾹 주소 읽기 (admin-console INV-K19 ④⑤). 값은 DB 설정 한 줄 — 대표가 운영자 화면에서 바꾸면 다음 읽기부터 새 값이다.
// 6자리를 받은 사람과 운영자에게만 값이 오고, 그 밖에는 null 이다 — null 이면 화면은 받는 주소 칸을 그리지 않는다(inbound-address-code INV-C2).

const addressShape = z.string().min(1).max(200).nullable();

/** 로그인한 사람의 세션 클라이언트로 읽는다. DB 오류는 실패로 올린다 — 조용히 null 로 바꾸면 결제한 팬에게서 주소 칸이 말없이 사라진다. */
export async function readOfficeAddress(client: Pick<SupabaseClient, "rpc">): Promise<string | null> {
  const { data, error } = await client.rpc("office_address");
  if (error) throw new Error(`팬꾹 주소를 읽지 못했다: ${error.code}`);
  return addressShape.parse(data);
}

export type OfficeAddressChange = { at: string; byNickname: string; before: string; after: string };
export type AdminOfficeAddress = { address: string; changes: OfficeAddressChange[] };

const changeRow = z.object({ at: z.string(), changed_by_nickname: z.string(), before_address: z.string(), after_address: z.string() });

/** 운영자 화면용 — 지금 값과 최근 변경 기록. 운영자가 아니면 DB 가 null 을 준다 — 운영자 화면에서는 실패로 본다. */
export async function readAdminOfficeAddress(client: Pick<SupabaseClient, "rpc">): Promise<AdminOfficeAddress> {
  const [now, log] = await Promise.all([client.rpc("admin_office_address"), client.rpc("admin_office_address_changes")]);
  if (now.error) throw new Error(`팬꾹 주소를 읽지 못했다: ${now.error.code}`);
  if (log.error) throw new Error(`팬꾹 주소 변경 기록을 읽지 못했다: ${log.error.code}`);
  const address = z.string().min(1).parse(now.data);
  const changes = z
    .array(changeRow)
    .parse(log.data)
    .map((r) => ({ at: r.at, byNickname: r.changed_by_nickname, before: r.before_address, after: r.after_address }));
  return { address, changes };
}
