import type { SupabaseClient } from "@supabase/supabase-js";

// 고객센터 양식을 그릴 때 내 계정이 문의 제한 중인지 묻는다 (admin-console INV-K12). 로그인한 사람의 세션 클라이언트로 —
// DB 가 그 토큰의 사람으로 답한다. 실제로 막는 것은 문의 남기기 함수이고, 이 답은 양식 대신 안내를 보여 주는 데만 쓴다.

export async function readMyInquiryRestricted(client: Pick<SupabaseClient, "rpc">): Promise<boolean> {
  const { data, error } = await client.rpc("my_inquiry_restricted");
  if (error) throw new Error(`문의 제한 여부를 읽지 못했다: ${error.code}`);
  if (typeof data !== "boolean") throw new Error("문의 제한 여부의 형식이 다르다");
  return data;
}
