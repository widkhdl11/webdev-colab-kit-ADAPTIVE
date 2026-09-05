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
export const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const SECRET = process.env.SUPABASE_SECRET_KEY ?? "";

if (!PUBLISHABLE || !SECRET) {
  throw new Error(
    "로컬 Supabase 키가 없다. `npm run test:integration` 으로 돌려라 — " +
      "그 스크립트가 `supabase status` 에서 키를 읽어 넣는다.",
  );
}

// **여기서도 로컬을 강제한다.** 변이 도구는 `SUPABASE_DB_URL` 이 원격이면 거부하는데,
// 통합 스위트가 실제로 쓰기를 보내는 곳은 `API_URL` + secret 키와 `DB_URL` 슈퍼유저 직결
// **둘 다**다. 하나만 막으면 "변이는 로컬에 심고 사용자·모집글은 원격에 만드는" 조합이
// 축만 바꿔서 그대로 남는다.
//
// **문자열 패턴으로는 못 가린다.** URL 문법에서 호스트를 정하는 것은 마지막 `@` 뒤라,
// `http://localhost:54321@evil.com` 은 「localhost 로 시작한다」를 통과하고 실제로는
// evil.com 에 붙는다 — 그 요청에 secret 키가 실린다. 그래서 파싱해서 호스트만 본다.
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLocalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // userinfo 가 있으면 더 엄한 검사를 건다 — 데이터베이스 접속(postgresql://)에만 허용하고
    // 그때도 호스트가 로컬이어야 한다. 사용자 정보가 URL 에 있으면 호스트가 어디인지
    // 눈으로 읽기 어려워지기 때문이다.
    if (u.username || u.password) return url.startsWith("postgresql://") && LOCAL_HOSTS.has(u.hostname);
    return LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

for (const [what, url] of [
  ["Supabase API", API_URL],
  ["데이터베이스", DB_URL],
] as const) {
  if (!isLocalUrl(url)) {
    throw new Error(`통합 테스트는 로컬에만 붙는다. ${what}가 가리키는 곳: ${url.replace(/\/\/[^/]*@/, "//***@")}`);
  }
}

/** 정책을 우회하는 관리자 연결. 준비물을 만들 때만 쓴다 — 판정에는 쓰지 않는다. */
export const admin: SupabaseClient = createClient(API_URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type TestUser = { id: string; email: string; client: SupabaseClient };

/**
 * 이 실행이 만든 사용자 id 장부. `createUser` 가 **사용자를 만든 직후** 적는다.
 *
 * 부르는 쪽이 적게 하면 만드는 것과 적는 것 사이가 벌어진다 — 사용자 다섯을 만든 뒤
 * 한꺼번에 적는 자리가 실제로 둘 있었고, 셋째에서 던지면 앞의 둘이 데이터베이스에
 * 영원히 남았다. 남은 사용자는 다음 실행의 판정을 바꾼다.
 */
const ledger: string[] = [];

/**
 * 실제 사용자를 만들고 **공개 키로 로그인한** 연결을 준다.
 *
 * 이것이 INV-Z5 검증의 핵심이다 — 공개 키는 브라우저에도 들어가는 값이라,
 * 이 연결로 할 수 있는 일이 곧 "아무나 할 수 있는 일"이다.
 */
export async function createUser(username: string): Promise<TestUser> {
  const email = `${username}-${randomUUID().slice(0, 8)}@example.test`;
  const password = randomUUID();

  // 이름은 계정 메타데이터로 넘긴다. **여기서 프로필을 따로 만들지 않는다** —
  // 0010 부터 프로필은 계정이 생기는 그 트랜잭션에서 트리거가 만든다(INV-A7).
  // 따로 만들려 들면 트리거가 이미 넣은 행과 부딪혀 중복 키로 죽는다.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) throw new Error(`사용자 생성 실패: ${error?.message}`);
  ledger.push(data.user.id); // 이 아래에서 던져도 지워진다

  // **이것은 판정이 아니라 진단이다.** INV-A7 의 계약은 `signup-profile.test.ts` 가 붙든다.
  // 여기서 한 번 보는 이유는, 트리거가 안 돌면 아래 테스트들이 "프로필이 없다"가 아니라
  // 외래 키 위반 같은 엉뚱한 곳에서 죽어 원인을 찾는 데 시간이 걸리기 때문이다.
  //
  // **이름 일치는 안 본다.** 그건 스펙 S5 의 Then 자체이고 signup-profile 이 소유한다.
  // 여기서 또 단언하면 20자가 넘는 이름으로 부르는 날 "이름이 다르다"로 죽는데, 진짜 원인은
  // 길이다. 그 경우를 아래 한 줄이 원인 그대로 말한다.
  if ([...username].length > 20) {
    throw new Error(`테스트가 넘긴 이름이 20자를 넘는다(${username}) — 트리거가 자르므로 값이 달라진다`);
  }
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("username")
    .eq("id", data.user.id)
    .maybeSingle();
  if (pErr) throw new Error(`프로필 조회 실패: ${pErr.message}`);
  if (!profile) throw new Error(`계정은 생겼는데 프로필이 없다 (INV-A7): ${data.user.id}`);

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

/**
 * 판정 함수를 **특정 사람의 눈으로** 부른다. `sql` 은 값 하나를 `v` 라는 이름으로 낸다.
 *
 * 0010 부터 판정 함수는 `private` 스키마에 있고 API 에 안 열려 있다 — 그게 그 수정의
 * 내용이라 supabase-js 의 `rpc()` 로는 못 부른다. 그런데 "누가 묻든 같은 답"(INV-P9)은
 * 여전히 확인해야 하므로, 데이터베이스에 직접 붙어 묻는다.
 *
 * **역할만 바꾸는 것으로는 부족하다.** `set local role authenticated` 만 하면 JWT 클레임이
 * 없어 `auth.uid()` 가 null 이고, 그러면 「로그인한 사람이 묻는다」가 아니라 「비로그인이
 * 묻는다」의 사본이 된다. 두 호출이 완전히 같은 질의가 되어 비교의 축이 사라진다.
 * 그래서 클레임도 같이 세우고, `authenticated` 인데 uid 를 안 주면 **던진다** —
 * 조용히 틀린 답을 기준으로 판정하는 것을 막는다.
 *
 * `set local` 과 `set_config(..., true)` 는 트랜잭션 범위라 되감으면 남지 않는다.
 */
export async function askAsRole(
  role: "anon" | "authenticated",
  sql: string,
  params: unknown[] = [],
  uid?: string,
): Promise<unknown> {
  if (role === "authenticated" && !uid) {
    throw new Error("askAsRole('authenticated') 에는 uid 가 필요하다 — 없으면 anon 과 같은 질문이 된다");
  }
  const c = await rawClient();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(uid ? { sub: uid, role } : { role }),
    ]);
    const r = await c.query(sql, params);
    await c.query("rollback");
    return r.rows[0]?.v;
  } finally {
    await c.end();
  }
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
 * 이 파일이 만든 사용자를 전부 지운다. 조건 없는 삭제가 아니라 장부의 id 로만 지운다.
 *
 * 실패를 삼키지 않는다 — 사용자가 남으면 프로필·스터디·참여자·채팅이 cascade 로 안 지워진
 * 채 쌓이고, 다음 실행이 그 위에서 돈다. 그러면 이번 코드와 무관한 빨간불/초록불이 나온다.
 */
export async function cleanupCreatedUsers(): Promise<void> {
  // 장부가 유일한 목록이다. 부르는 쪽이 따로 배열을 들고 있으면 그 배열은 검증되지 않는
  // 장식이 되고(적는 것을 빠뜨려도 아무 일도 안 일어난다) 언젠가 조용히 낡는다.
  const targets = [...new Set(ledger)];
  ledger.length = 0;

  const failed: string[] = [];
  for (const id of targets) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) failed.push(`${id}: ${error.message}`);
  }
  if (failed.length > 0) {
    // 못 지운 것은 장부에 되돌려 둔다 — 다음 호출이 다시 시도한다.
    ledger.push(...failed.map((f) => f.split(":")[0]));
    throw new Error(
      `테스트 사용자 정리 실패 ${failed.length}건 — 남은 데이터가 다음 실행의 판정을 바꾼다: ` +
        failed.join(" / "),
    );
  }
}
