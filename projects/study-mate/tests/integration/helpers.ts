// 통합 테스트 공용 도구 — 로컬 Supabase 에 실제로 붙는다.
//
// 왜 실제 데이터베이스인가: 여기서 검증하는 불변식들은 강제 위치가 데이터베이스다
// (제약 · 트리거 · 행 수준 접근 정책). 흉내 낸 객체로는 "정책이 실제로 거부하는가"를
// 물을 수 없다 — 흉내가 거부하면 흉내가 거부한 것이지 정책이 거부한 것이 아니다.
//
// 접속 정보는 `npx supabase status` 가 주는 로컬 값을 환경변수로 받는다. 이 값들은
// Supabase 가 모든 로컬 개발자에게 똑같이 주는 고정값이라 비밀이 아니지만, 그래도
// 파일에 적지 않는다 — 파일에 적힌 키는 언젠가 진짜 키로 바뀌어 커밋된다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

export const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PUBLISHABLE || !SECRET) {
  throw new Error(
    "로컬 Supabase 키가 없다. `npm run test:integration` 으로 돌려라 — " +
      "그 스크립트가 `supabase status` 에서 키를 읽어 넣는다.",
  );
}

/** 정책을 우회하는 관리자 연결. 준비물을 만들 때만 쓴다 — 판정에는 쓰지 않는다. */
export const admin: SupabaseClient = createClient(API_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = { id: string; email: string; client: SupabaseClient };

/**
 * 실제 사용자를 만들고 **공개 키로 로그인한** 연결을 준다.
 *
 * 이것이 INV-Z5 검증의 핵심이다 — 공개 키는 브라우저에도 들어가는 값이라,
 * 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다.
 */
export async function createUser(username: string): Promise<TestUser> {
  const email = `${username}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`사용자 생성 실패: ${error?.message}`);

  const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, username });
  if (pErr) throw new Error(`프로필 생성 실패: ${pErr.message}`);

  const client = createClient(API_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sErr } = await client.auth.signInWithPassword({ email, password });
  if (sErr) throw new Error(`로그인 실패: ${sErr.message}`);

  return { id: data.user.id, email, client };
}

/** 로그인하지 않은 공개 키 연결 — "지나가던 아무나". */
export function anonClient(): SupabaseClient {
  return createClient(API_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createStudy(
  hostId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await admin
    .from("studies")
    .insert({
      host_id: hostId,
      title: "테스트 스터디",
      description: "본문",
      category_id: "it",
      region_code: "seoul",
      meeting_mode: "online",
      max_participants: 3,
      ...overrides,
    })
    .select("id")
    .single();
  if (error) throw new Error(`스터디 생성 실패: ${error.message}`);
  return data.id as string;
}

/** 트리거를 직접 눌러 보기 위한 원시 연결. 트랜잭션을 손에 쥐어야 할 때 쓴다. */
export async function rawClient(): Promise<Client> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  return c;
}

/** 신청을 넣는다(대기 상태). 절차가 다섯 곳에 흩어져 있던 것을 여기로 모았다. */
export async function apply(studyId: string, userId: string): Promise<void> {
  const { error } = await admin.from("participants").insert({ study_id: studyId, user_id: userId });
  if (error) throw new Error(`신청 생성 실패: ${error.message}`);
}

/**
 * 신청을 수락한다. **결과를 그대로 돌려준다** — 던지지 않는 이유는 "거부되는지"를 보는
 * 테스트가 여럿이라, 그쪽이 error 를 직접 읽어야 하기 때문이다.
 */
export async function accept(studyId: string, userId: string) {
  return admin
    .from("participants")
    .update({ status: "accepted" })
    .eq("study_id", studyId)
    .eq("user_id", userId);
}

/** 신청 → 수락까지 한 번에. 「이미 참여 중인 사람」이 필요한 테스트의 준비물. */
export async function acceptedMember(studyId: string, userId: string): Promise<void> {
  await apply(studyId, userId);
  const { error } = await accept(studyId, userId);
  if (error) throw new Error(`수락 실패: ${error.message}`);
}

/** 그 스터디의 채팅방 id. 스터디를 만들 때 트리거가 하나 만들어 둔다. */
export async function chatIdOf(studyId: string): Promise<string> {
  const { data, error } = await admin.from("chats").select("id").eq("study_id", studyId).single();
  if (error || !data) throw new Error(`채팅방을 못 찾았다: ${error?.message}`);
  return data.id as string;
}

/**
 * 테스트가 만든 것을 지운다. 조건 없는 삭제가 아니라 id 목록으로만 지운다.
 *
 * 실패를 삼키지 않는다 — 사용자가 남으면 프로필·스터디·참여자·채팅이 cascade 로 안 지워진
 * 채 쌓이고, 다음 실행이 그 위에서 돈다. 그러면 이번 코드와 무관한 빨간불/초록불이 나온다.
 */
export async function cleanupUsers(ids: string[]): Promise<void> {
  const failed: string[] = [];
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failed.push(`${id}: ${error.message}`);
  }
  if (failed.length > 0) {
    throw new Error(
      `테스트 사용자 정리 실패 ${failed.length}건 — 남은 데이터가 다음 실행의 판정을 바꾼다: ` +
        failed.join(" / "),
    );
  }
}
