import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  adminVerificationsFromRows,
  myVerificationsFromRows,
  myVerificationStateFromRows,
  type AdminVerification,
  type MyVerification,
  type MyVerificationState,
} from "../model/creator-verification";

// 크리에이터 본인 확인 읽기 (creator-verification INV-V11·V12). 모두 로그인한 사람의 세션 클라이언트로 부른다 —
// 누구의 신청인지·운영자인지는 DB 가 그 토큰의 사람으로 정한다. 계정 값을 인자로 넘기지 않는다.

/** 로그인한 크리에이터 자신의 신청(최근 것부터). 메모·상대 계정 칸은 오지 않는다(INV-V9·V11). */
export async function readMyVerifications(client: Pick<SupabaseClient, "rpc">): Promise<MyVerification[]> {
  const { data, error } = await client.rpc("my_creator_verifications");
  if (error) throw new Error(`본인 확인 신청을 읽지 못했다: ${error.code}`);
  const rows = myVerificationsFromRows(data);
  if (!rows) throw new Error("본인 확인 신청의 모양이 다르다");
  return rows;
}

/** 로그인한 크리에이터 자신의 확인 상태와 지금 채널. 크리에이터 줄이 없으면 null. */
export async function readMyVerificationState(client: Pick<SupabaseClient, "rpc">): Promise<MyVerificationState | null> {
  const { data, error } = await client.rpc("my_creator_verification_state");
  if (error) throw new Error(`본인 확인 상태를 읽지 못했다: ${error.code}`);
  const state = myVerificationStateFromRows(data);
  if (state === undefined) throw new Error("본인 확인 상태의 모양이 다르다");
  return state;
}

/** 운영자 신청 목록(운영자가 아니면 DB 가 0줄). 연락처·실명 칸은 없다(INV-V11, admin-console INV-K8). */
export async function readAdminVerifications(client: Pick<SupabaseClient, "rpc">): Promise<AdminVerification[]> {
  const { data, error } = await client.rpc("admin_creator_verifications");
  if (error) throw new Error(`본인 확인 신청 목록을 읽지 못했다: ${error.code}`);
  const rows = adminVerificationsFromRows(data);
  if (!rows) throw new Error("본인 확인 신청 목록의 모양이 다르다");
  return rows;
}

const movingRow = z.object({ creator_id: z.guid() }).strict();

/** INV-V12: 지금 채널 이사 중인 크리에이터 id — 선물 보내기 화면의 안내용(등록은 DB 가 막는다). */
export async function readMovingCreatorIds(client: Pick<SupabaseClient, "rpc">): Promise<string[]> {
  const { data, error } = await client.rpc("moving_creator_ids");
  if (error) throw new Error(`채널 이사 중인 크리에이터를 읽지 못했다: ${error.code}`);
  return z.array(movingRow).parse(data).map((r) => r.creator_id);
}
