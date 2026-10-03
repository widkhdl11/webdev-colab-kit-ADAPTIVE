import type { SupabaseClient } from "@supabase/supabase-js";
import { adminAccessOf, type AdminAccess } from "../model/admin-access";

// 로그인한 사람의 세션 클라이언트로 DB 에 운영자·대표인지 묻는다(INV-K1·K2). 판정은 DB 가 로그인 토큰의 사람으로 한다.
// 손님은 두 함수 실행 권한이 없어 오류가 나고, 오류는 「아니다」로 본다.

async function askFlag(client: Pick<SupabaseClient, "rpc">, fn: "is_operator" | "is_owner"): Promise<boolean | null> {
  try {
    const { data, error } = await client.rpc(fn);
    if (error || typeof data !== "boolean") return null;
    return data;
  } catch {
    return null;
  }
}

export async function readAdminAccess(client: Pick<SupabaseClient, "rpc">): Promise<AdminAccess> {
  const operator = await askFlag(client, "is_operator");
  if (operator !== true) return adminAccessOf({ operator, owner: null });
  return adminAccessOf({ operator, owner: await askFlag(client, "is_owner") });
}
