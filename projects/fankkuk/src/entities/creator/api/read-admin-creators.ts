import type { SupabaseClient } from "@supabase/supabase-js";
import { adminCreatorsFromRows, verificationEventsFromRows, type AdminCreator, type VerificationEvent } from "../model/admin-creator";

// 관리자 「크리에이터 확인」 화면의 읽기 (admin-console INV-K10·K8). 로그인한 운영자의 세션 클라이언트로 부른다.

export async function readAdminCreators(client: Pick<SupabaseClient, "rpc">): Promise<AdminCreator[]> {
  const { data, error } = await client.rpc("admin_creators");
  if (error) throw new Error(`크리에이터 목록을 읽지 못했다: ${error.code}`);
  const creators = adminCreatorsFromRows(data);
  if (!creators) throw new Error("크리에이터 목록의 모양이 다르다");
  return creators;
}

export async function readVerificationEvents(client: Pick<SupabaseClient, "rpc">): Promise<VerificationEvent[]> {
  const { data, error } = await client.rpc("admin_creator_verification_events");
  if (error) throw new Error(`본인 확인 처리 기록을 읽지 못했다: ${error.code}`);
  const events = verificationEventsFromRows(data);
  if (!events) throw new Error("본인 확인 처리 기록의 모양이 다르다");
  return events;
}
