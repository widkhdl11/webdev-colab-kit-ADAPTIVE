import type { SupabaseClient } from "@supabase/supabase-js";
import {
  adminCreatorsFromRows,
  nameChangesFromRows,
  verificationEventsFromRows,
  type AdminCreator,
  type NameChange,
  type VerificationEvent,
} from "../model/admin-creator";

// 관리자 「크리에이터 확인」 화면의 읽기 (admin-console INV-K10·K8). 로그인한 운영자의 세션 클라이언트로 부른다.

export async function readAdminCreators(client: Pick<SupabaseClient, "rpc">): Promise<AdminCreator[]> {
  const { data, error } = await client.rpc("admin_creators");
  if (error) throw new Error(`크리에이터 목록을 읽지 못했다: ${error.code}`);
  const creators = adminCreatorsFromRows(data);
  if (!creators) throw new Error("크리에이터 목록의 형식이 다르다");
  return creators;
}

/** 공개 이름 바꾼 기록, 최근 것부터(admin_creator_name_changes — 운영자가 아니면 줄이 없다, my-account INV-A9). */
export async function readNameChanges(client: Pick<SupabaseClient, "rpc">): Promise<NameChange[]> {
  const { data, error } = await client.rpc("admin_creator_name_changes");
  if (error) throw new Error(`공개 이름 바꾼 기록을 읽지 못했다: ${error.code}`);
  const changes = nameChangesFromRows(data);
  if (!changes) throw new Error("공개 이름 바꾼 기록의 형식이 다르다");
  return changes;
}

export async function readVerificationEvents(client: Pick<SupabaseClient, "rpc">): Promise<VerificationEvent[]> {
  const { data, error } = await client.rpc("admin_creator_verification_events");
  if (error) throw new Error(`본인 확인 처리 기록을 읽지 못했다: ${error.code}`);
  const events = verificationEventsFromRows(data);
  if (!events) throw new Error("본인 확인 처리 기록의 형식이 다르다");
  return events;
}
