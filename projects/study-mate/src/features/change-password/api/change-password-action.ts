"use server";

// 비밀번호 변경 액션. 본체와 조립은 change-password.ts 에 있다 — 이 파일의 내보내기는
// 전부 클라이언트가 부를 수 있는 자리다.

import type { ActionResult } from "@/shared/lib/action-result";
import { makeChangePassword, type PasswordChanged } from "./change-password";

const guarded = makeChangePassword();

export async function changePasswordAction(
  _previous: ActionResult<PasswordChanged> | null,
  form: FormData,
): Promise<ActionResult<PasswordChanged>> {
  return guarded(form);
}
