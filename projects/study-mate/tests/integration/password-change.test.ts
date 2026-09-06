// 근거 스펙: docs/specs/password-change.md (INV-C1 · C2 · C3)
//
// **여기는 진짜 인증 서버에 붙는다.** 유닛 검사는 순서와 조건을 붙들지만(확인이 먼저인가,
// 실패하면 그다음이 안 일어나는가) 「현재 비밀번호가 정말 맞는지」와 「다른 기기가 정말
// 끊기는지」는 가짜로 알 수 없다. 그 둘만 여기서 본다.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  changePassword,
  DEFAULT_DEPS,
  WRONG_CURRENT,
} from "@/features/change-password/api/change-password";
import { createVerifierSupabase } from "@/shared/api/supabase/verifier-client";
import { readVerifiedUser } from "@/entities/session";
import { API_URL, PUBLISHABLE, anonClient, cleanupCreatedUsers, createUser, type TestUser } from "./helpers";

let me: TestUser;
/** 지금 비밀번호. 검사가 진행되면서 바뀌므로 따로 들고 다닌다 */
let current: string;

/** 같은 계정으로 로그인한 또 하나의 「기기」 */
async function anotherDevice(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(API_URL, PUBLISHABLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`두 번째 기기 로그인 실패: ${error.message}`);
  return client;
}

/** 액션이 실제로 받는 모양 그대로 만든다 */
function 폼(currentPw: string, nextPw: string): FormData {
  const form = new FormData();
  form.append("current", currentPw);
  form.append("next", nextPw);
  return form;
}

/**
 * 진짜 연결을 끼운다 — 확인용은 **프로덕션이 쓰는 그 팩토리**, 세션용은 로그인된 연결.
 *
 * 확인용을 여기서 손으로 만들면 `createVerifierSupabase` 가 어느 검사에서도 안 돌아서,
 * 그것을 쿠키 클라이언트로 바꿔치기해도(INV-C2 위반) 아무것도 안 깨진다.
 */
function 진짜(session: SupabaseClient) {
  return {
    createVerifier: DEFAULT_DEPS.createVerifier,
    createSession: (async () => session) as never,
  };
}

beforeAll(async () => {
  me = await createUser("c-me");
  current = me.password;
}, 60_000);

afterAll(async () => {
  await cleanupCreatedUsers();
});

describe("배선", () => {
  it("INV-C2: 확인용은 쿠키를 안 만지는 팩토리다 — 둘을 뒤바꾸면 이 줄이 깨진다", () => {
    expect(DEFAULT_DEPS.createVerifier).toBe(createVerifierSupabase);
  });

  it("확인용 클라이언트는 세션을 저장하지 않는다", async () => {
    const verifier = await createVerifierSupabase();
    // 아무도 로그인 안 한 새 연결이다. 쿠키를 읽었다면 지금 세션이 실려 있을 것이다.
    const { data } = await verifier.auth.getSession();
    expect(data.session).toBeNull();
  });
});

describe("세션이 이메일을 싣는다", () => {
  it("INV-C1: 검증된 클레임에 이메일이 있다 — 없으면 이 기능이 통째로 멈춘다", async () => {
    const 세션 = await readVerifiedUser(me.client.auth);
    expect(세션?.id).toBe(me.id);
    // 이것이 없으면 프로덕션에서 「계정 정보를 확인하지 못했습니다」로만 끝난다.
    // 통합 검사가 사용자 객체를 손으로 만들어 넣으므로, 이 한 줄이 없으면 아무도 안 본다.
    expect(세션?.email).toBe(me.email);
  });
});

describe("INV-C1: 현재 비밀번호를 맞혀야 새 비밀번호가 저장된다", () => {
  it("INV-C1(실패경로, S1): 틀리면 비밀번호가 그대로다 — 옛 비밀번호로 여전히 로그인된다", async () => {
    const 결과 = await changePassword(
      { id: me.id, email: me.email },
      폼("이건아니다", "새비밀번호1234"),
      진짜(me.client),
    );

    expect(결과).toEqual({ ok: false, message: WRONG_CURRENT });

    // **말이 아니라 실제로 확인한다.** 실패 문구만 보면, 문구는 실패인데 비밀번호는
    // 바뀐 상태와 구분되지 않는다.
    const 확인 = anonClient();
    const { error } = await 확인.auth.signInWithPassword({ email: me.email, password: current });
    expect(error).toBeNull();
  });

  it("INV-C2(실패경로, S3): 틀린 뒤에도 지금 세션이 그대로다", async () => {
    // 위 검사가 확인용 연결로 로그인을 한 번 했다. 그것이 지금 세션을 건드렸다면
    // 여기서 드러난다 — 세션 클라이언트가 자기 사용자를 여전히 읽을 수 있어야 한다.
    const { data, error } = await me.client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(me.id);
  });

  it("INV-C1(반대 절반, S2): 맞으면 새 비밀번호로 로그인되고 옛 것으로는 안 된다", async () => {
    const 새것 = "새비밀번호-1234";
    const 결과 = await changePassword(
      { id: me.id, email: me.email },
      폼(current, 새것),
      진짜(me.client),
    );
    expect(결과.ok).toBe(true);

    const 새연결 = anonClient();
    const 성공 = await 새연결.auth.signInWithPassword({ email: me.email, password: 새것 });
    expect(성공.error).toBeNull();

    const 옛연결 = anonClient();
    const 실패 = await 옛연결.auth.signInWithPassword({ email: me.email, password: current });
    expect(실패.error).not.toBeNull();

    current = 새것;
  });
});

describe("INV-C4: 새 비밀번호의 강도 규칙은 우리가 다시 적지 않는다", () => {
  it("INV-C4(S6): 인증 서버의 하한에 못 미치면 그 사유가 그대로 오고 비밀번호는 그대로다", async () => {
    const 결과 = await changePassword(
      { id: me.id, email: me.email },
      폼(current, "123"),
      진짜(me.client),
    );

    expect(결과.ok).toBe(false);
    // 우리가 지은 문장이 아니라 인증 서버가 준 사유여야 한다 — 두 벌이 되면 안 된다
    if (!결과.ok) expect(결과.message).toMatch(/password/i);

    const 확인 = anonClient();
    const { error } = await 확인.auth.signInWithPassword({ email: me.email, password: current });
    expect(error).toBeNull();
  });

  it("INV-C4(반대 절반): 서버가 받아 주는 최소 길이는 우리도 안 막는다", async () => {
    // **이쪽이 「우리 쪽 하한이 없다」를 붙드는 자리다.** 코드에 `next.length < 8` 같은
    // 줄을 넣으면 여기서 빨간불이 난다. 앞의 검사만 있으면 그런 줄을 넣어도 초록불이다.
    const 여섯자 = "aB3xY9";
    const 결과 = await changePassword(
      { id: me.id, email: me.email },
      폼(current, 여섯자),
      진짜(me.client),
    );
    expect(결과.ok).toBe(true);
    current = 여섯자;
  });
});

describe("INV-C3: 바꾸면 다른 기기가 끊기고 지금 기기는 남는다", () => {
  it("INV-C3(S4·S5): 다른 기기의 세션은 더 갱신되지 않고, 바꾼 기기는 남는다", async () => {
    // 기기 A(지금 세션)와 기기 B 를 같은 계정으로 만든다
    const deviceA = await anotherDevice(me.email, current);
    const deviceB = await anotherDevice(me.email, current);

    const 새것 = "또다른비밀번호-5678";
    const 결과 = await changePassword(
      { id: me.id, email: me.email },
      폼(current, 새것),
      진짜(deviceA),
    );
    expect(결과.ok).toBe(true);
    current = 새것;

    // B 는 끊긴다 — 갱신 토큰이 무효가 되어 세션을 이어갈 수 없다
    const b = await deviceB.auth.refreshSession();
    expect(b.error).not.toBeNull();

    // A 는 남는다. 바꾸자마자 로그아웃되면 사용자는 무엇이 성공했는지 모른다
    const a = await deviceA.auth.refreshSession();
    expect(a.error).toBeNull();
    expect(a.data.user?.id).toBe(me.id);
  }, 30_000);
});
