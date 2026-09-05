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
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    // 비밀번호 규칙 같은 것은 그대로 보여 준다 — 고칠 수 있는 정보다.
    return { ok: false, message: error.message };
  }
  if (!data.user) return { ok: false, message: "가입하지 못했습니다. 잠시 뒤 다시 시도해 주세요" };

  // 프로필은 본인만 만들 수 있다(profiles_insert_own). 방금 만들어진 세션으로 넣는다.
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: data.user.id, username });

  if (profileError) {
    // 계정은 생겼는데 프로필이 없으면 화면 곳곳에서 이름이 빈다. 조용히 넘기지 않는다.
    return {
      ok: false,
      message: `계정은 만들어졌지만 프로필 저장에 실패했습니다: ${profileError.message}`,
    };
  }

  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
