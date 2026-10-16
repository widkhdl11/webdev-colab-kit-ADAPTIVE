import type { SupabaseClient } from "@supabase/supabase-js";
import { myInquiriesFromRows, type MyInquiry } from "../model/my-inquiry";

// 고객센터 「내 문의」 읽기 (admin-console INV-K11). 로그인한 사람의 세션 클라이언트로 부른다 —
// DB 가 그 토큰의 사람이 쓴 문의만 돌려준다.

export async function readMyInquiries(client: Pick<SupabaseClient, "rpc">): Promise<MyInquiry[]> {
  const { data, error } = await client.rpc("my_inquiries");
  if (error) throw new Error(`내 문의를 읽지 못했다: ${error.code}`);
  const inquiries = myInquiriesFromRows(data);
  if (!inquiries) throw new Error("내 문의 목록의 형식이 다르다");
  return inquiries;
}
