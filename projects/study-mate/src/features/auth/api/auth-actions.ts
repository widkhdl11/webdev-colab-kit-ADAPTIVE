"use server";

// 로그인·회원가입·로그아웃. 근거 스펙: docs/specs/auth-session.md (INV-A2·A3·A6)

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { ActionResult } from "@/shared/lib/action-result";
import { safeNextPath } from "../model/safe-next";

/**
 * 왜 실패했는지 사람의 말로. **어느 쪽이 틀렸는지는 말하지 않는다** —
 * "이 이메일은 없다"와 "비밀번호가 틀렸다"를 가르면 그것만으로 가입 여부를 물어볼 수 있다.
 */
const SIGN_IN_FAILED = "이메일 또는 비밀번호가 맞지 않습니다";

function readCredentials(form: FormData) {
  return {
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
    next: safeNextPath(String(form.get("next") ?? "")),
  };
}

export async function signInAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const { email, password, next } = readCredentials(form);
  if (!email || !password) return { ok: false, message: "이메일과 비밀번호를 모두 입력해 주세요" };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, message: SIGN_IN_FAILED };

  // 성공하면 여기서 끝난다. redirect 는 예외를 던져 흐름을 끊으므로 아래로 안 내려간다.
  redirect(next);
}

export async function signUpAction(
  _previous: ActionResult<null> | null,
  form: FormData,
): Promise<ActionResult<null>> {
  const { email, password, next } = readCredentials(form);
  const username = String(form.get("username") ?? "").trim();

  if (!email || !password || !username) {
    return { ok: false, message: "이름·이메일·비밀번호를 모두 입력해 주세요" };
  }
  if (username.length > 20) return { ok: false, message: "이름은 20자까지 쓸 수 있습니다" };

  const supabase = await createServerSupabase();
  // 이름은 가입 요청에 실어 보낸다. **여기서 프로필을 만들지 않는다** — 계정 행이 들어오는
  // 그 트랜잭션에서 데이터베이스 트리거가 만든다(0010). 앱이 만들던 때는 "가입 직후에
  // 세션이 있다"에 기대고 있었고, 이메일 확인이 켜지면 그 전제가 깨져 프로필 없는 계정이
  // 남았다. 길이 하한은 아래 폼 검사와 profiles_username_length 제약 양쪽에 있다.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) {
    // 비밀번호 규칙 같은 것은 그대로 보여 준다 — 고칠 수 있는 정보다.
    return { ok: false, message: error.message };
  }
  if (!data.user) return { ok: false, message: "가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요" };

  // **`data.session` 이 null 인 경우를 여기서 안 가른다 — 아직 못 가른다.**
  // 이메일 확인이 켜져 있으면 `signUp` 은 사용자만 만들고 세션 없이 돌아온다(이 파일이
  // 고친 그 경우다). 그때 그대로 `next` 로 보내면 보호 경로에서 프록시가 곧바로 로그인
  // 화면으로 되돌리고, 사용자는 "가입했는데 로그인 화면"만 본다. **프로필은 이제 생기지만
  // (INV-A7) 사람에게는 여전히 막힌 것으로 보인다.**
  //
  // 제대로 가르려면 "메일함을 확인하세요"를 띄울 자리가 화면에 있어야 하는데, 지금
  // `ActionResult` 의 성공 갈래에는 문구가 없고 폼도 실패만 그린다. 화면을 만드는 것은
  // 이 diff 의 범위 밖이라 `docs/BACKLOG.md` 의 이메일 확인 항목에 붙였다.
  // 지금 설정은 `enable_confirmations = false` 라 이 가지가 안 돈다.
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
