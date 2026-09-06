// 비밀번호 변경의 본체. 근거 스펙: docs/specs/password-change.md (INV-C1 ~ INV-C6)
//
// **"use server" 파일과 나눠 둔 이유.** 서버 액션 파일은 모든 내보내기가 액션이 되어
// 클라이언트에서 부를 수 있는 자리가 된다. 판독기·클라이언트를 인자로 여는 조립 함수를
// 거기 두면 그 인자가 요청으로 들어올 수 있는 값이 된다(`features/create-post` 와 같은 판단).

import { currentUser, requireSession } from "@/entities/session";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { createVerifierSupabase } from "@/shared/api/supabase/verifier-client";
import type { ActionResult } from "@/shared/lib/action-result";

/**
 * 현재 비밀번호가 틀렸을 때의 문구.
 *
 * 인증 서버가 준 문장을 그대로 쓰지 않는다 — 그건 영어이고("Invalid login credentials")
 * 여기서 사용자가 알아야 하는 것은 딱 하나다. 반대로 **새 비밀번호**의 사유는 그대로 보여
 * 준다(INV-C4) — 그건 고칠 수 있는 정보다.
 */
export const WRONG_CURRENT = "현재 비밀번호가 맞지 않습니다";

/**
 * 확인이 「틀렸다」가 아닌 이유로 실패했을 때. 요청 제한·서버 오류가 여기 온다.
 *
 * 하나로 접으면 안 되는 이유: 로그인과 이 확인 호출은 같은 출발지에서 인증 서버를 부르므로
 * 요청 제한 통을 나눠 쓴다. 그 통이 비면 **맞게 적은 사람에게도** 「맞지 않습니다」가 뜨고,
 * 사용자는 자기 비밀번호를 의심하며 계속 다시 시도한다.
 */
export const VERIFY_UNAVAILABLE = "지금은 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요";

/** 성공했을 때 화면이 문구를 고르는 데 쓰는 값 */
export type PasswordChanged = {
  /** 다른 기기의 로그인을 실제로 끊었나. 실패했으면 화면이 그렇게 말해야 한다 */
  readonly othersSignedOut: boolean;
};

/**
 * 이 기능이 인증 서버에 닿는 두 자리.
 *
 * **둘이 나뉘어 있는 것이 INV-C2 다.** 확인용은 쿠키를 읽지도 쓰지도 않는 클라이언트라,
 * 현재 비밀번호를 확인하는 로그인 호출이 지금 세션 쿠키를 갈아치우지 않는다. 하나로 합치면
 * 비밀번호를 틀렸을 때조차 로그인 상태가 흔들린다 — 실패해야 할 요청이 로그아웃을 일으킨다.
 */
export type AuthDeps = {
  readonly createVerifier: typeof createVerifierSupabase;
  readonly createSession: typeof createServerSupabase;
};

export const DEFAULT_DEPS: AuthDeps = {
  createVerifier: createVerifierSupabase,
  createSession: createServerSupabase,
};

/**
 * 비밀번호 칸은 **자르지 않고 원문 그대로** 읽는다.
 *
 * 공백도 비밀번호의 일부다. 자르면 두 가지가 난다 — 끝에 공백이 있는 비밀번호를 쓰는
 * 사람은 맞게 쳐도 영영 확인을 통과 못 하고, 공백이 든 새 비밀번호는 잘린 값이 저장되는데
 * 로그인 폼은 안 자르므로 방금 정한 대로 쳐도 안 들어가진다. 둘 다 빠져나올 길이
 * 비밀번호 재설정뿐이고 화면에는 아무 오류도 안 뜬다.
 * (로그인·가입도 같은 이유로 비밀번호만 원문을 쓴다 — `features/auth/api/auth-actions.ts`)
 */
function rawPassword(form: FormData, name: string): string {
  return String(form.get(name) ?? "");
}

/**
 * 비밀번호를 바꾼다. 순서가 곧 계약이다 — **확인 → 변경 → 다른 기기 끊기**.
 *
 * **확인에 쓰는 이메일은 폼이 아니라 세션에서 온다** (INV-C1 의 신뢰 경계). 폼에서 받으면
 * 남의 계정으로 확인을 통과시키고 **내 세션의 비밀번호를 바꾸는** 조합이 열린다.
 * 확인이 통과한 계정이 이 세션의 계정과 같은지도 본다 — 지금은 이메일이 계정마다 유일해서
 * 자명하지만, 그 전제가 코드에 없으면 이메일 변경 기능이 생기는 날 조용히 어긋난다.
 *
 * **다른 기기를 끊는 것은 변경이 성공한 뒤에만 한다** (INV-C5). 먼저 끊으면 변경이 실패했을
 * 때 비밀번호는 그대로인데 다른 기기만 로그아웃된 상태가 남는다.
 */
export async function changePassword(
  user: { readonly id: string; readonly email?: string },
  form: FormData,
  deps: AuthDeps = DEFAULT_DEPS,
): Promise<ActionResult<PasswordChanged>> {
  const current = rawPassword(form, "current");
  const next = rawPassword(form, "next");

  if (!current.trim() || !next.trim()) {
    return { ok: false, message: "지금 비밀번호와 새 비밀번호를 모두 적어 주세요" };
  }
  if (current === next) return { ok: false, message: "지금 쓰는 것과 다른 비밀번호를 적어 주세요" };

  // 세션에 이메일이 없으면 확인할 방법이 없다. 확인 없이 넘어가면 INV-C1 이 조용히 사라지므로
  // 여기서 멈춘다 — 「확인을 못 했다」와 「확인했다」가 같은 결과가 되면 안 된다.
  const email = user.email;
  if (!email) return { ok: false, message: "계정 정보를 확인하지 못했습니다. 다시 로그인해 주세요" };

  const verifier = await deps.createVerifier();
  const { data: verified, error: wrong } = await verifier.auth.signInWithPassword({
    email,
    password: current,
  });

  // **확인용 세션을 즉시 끊는다.** 이 호출은 인증 서버에서 진짜 로그인이라 세션 행이 하나
  // 생기는데, 우리는 그것을 저장하지 않으므로 아무도 안 쥔 채 남는다.
  // **범위를 반드시 적는다** — 인자 없는 `signOut()` 은 기본이 「전부」라 지금 기기까지
  // 끊기고, 그러면 INV-C3 의 뒤쪽 절반(지금 기기는 남는다)을 정면으로 어긴다.
  await verifier.auth.signOut({ scope: "local" });

  if (wrong) {
    // 원인을 로그로 남긴다. 「틀렸다」와 「지금은 확인할 수 없다」를 화면에서 가르는 근거다.
    console.error(`[auth] 현재 비밀번호 확인 실패 status=${wrong.status ?? "?"} code=${wrong.code ?? "?"}`);
    const unavailable = wrong.status === 429 || (wrong.status ?? 0) >= 500;
    return { ok: false, message: unavailable ? VERIFY_UNAVAILABLE : WRONG_CURRENT };
  }
  if (verified.user?.id !== user.id) return { ok: false, message: WRONG_CURRENT };

  const supabase = await deps.createSession();
  const { error: failed } = await supabase.auth.updateUser({ password: next });
  // 새 비밀번호의 규칙은 인증 서버가 정한다(INV-C4). 그 사유는 고칠 수 있는 정보라 그대로 보여 준다.
  if (failed) return { ok: false, message: failed.message ?? "비밀번호를 바꾸지 못했습니다" };

  // 다른 기기만 끊는다(INV-C3). 지금 기기까지 끊으면 바꾸자마자 로그아웃되어
  // 사용자는 무엇이 성공했는지 모른다.
  //
  // **결과를 본다.** 버리면, 끊기가 실패했는데 화면은 「끊었습니다」를 사실로 말한다 —
  // 비밀번호를 바꾼 이유(남이 들어온 것 같다)가 통째로 무효가 되는데 사용자는 성공 화면을
  // 본다. 그렇다고 전체를 실패로 뒤집으면 안 된다 — 비밀번호는 이미 바뀌었고, 안 바뀌었다고
  // 말하는 것은 INV-C5 를 반대 방향으로 어기는 것이다.
  const { error: kept } = await supabase.auth.signOut({ scope: "others" });
  if (kept) console.error(`[auth] 다른 기기 로그아웃 실패 message=${kept.message}`);

  return { ok: true, value: { othersSignedOut: !kept } };
}

/** 세션 가드를 붙인 것 (INV-C6·INV-A4). 액션 파일이 이것을 한 번 부른다 */
export function makeChangePassword(
  readUser: typeof currentUser = currentUser,
  deps: AuthDeps = DEFAULT_DEPS,
) {
  return requireSession(readUser, (user, form: FormData) => changePassword(user, form, deps));
}
