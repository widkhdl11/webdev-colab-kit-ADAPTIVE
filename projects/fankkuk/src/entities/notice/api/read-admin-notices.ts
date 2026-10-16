import type { SupabaseClient } from "@supabase/supabase-js";
import { adminNoticesFromRows, type AdminNotice } from "../model/admin-notice";

// 관리자 「공지」 화면의 읽기 (admin-console INV-K11). 로그인한 운영자의 세션 클라이언트로 부른다.

export async function readAdminNotices(client: Pick<SupabaseClient, "rpc">): Promise<AdminNotice[]> {
  const { data, error } = await client.rpc("admin_notices");
  if (error) throw new Error(`공지 목록을 읽지 못했다: ${error.code}`);
  const notices = adminNoticesFromRows(data);
  if (!notices) throw new Error("공지 목록의 형식이 다르다");
  return notices;
}
