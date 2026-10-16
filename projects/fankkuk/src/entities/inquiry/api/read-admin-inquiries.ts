import type { SupabaseClient } from "@supabase/supabase-js";
import { adminInquiriesFromRows, type AdminInquiry } from "../model/admin-inquiry";

// 관리자 「1:1 문의」 화면의 읽기 (admin-console INV-K11). 로그인한 운영자의 세션 클라이언트로 부른다 —
// 운영자가 아니면 DB 가 빈 결과를 준다(쓴 사람 본인은 my_inquiries 로만 읽는다).

export async function readAdminInquiries(client: Pick<SupabaseClient, "rpc">): Promise<AdminInquiry[]> {
  const { data, error } = await client.rpc("admin_inquiries");
  if (error) throw new Error(`문의 목록을 읽지 못했다: ${error.code}`);
  const inquiries = adminInquiriesFromRows(data);
  if (!inquiries) throw new Error("문의 목록의 형식이 다르다");
  return inquiries;
}
