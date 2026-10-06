import { postJson } from "@/shared/lib/http/post-json-client";

// 브라우저에서 비밀번호 바꾸기를 서버에 보낸다. 서버가 준 문구와 틀린 칸을 그대로 넘긴다.

export type ChangePasswordField = "currentPassword" | "newPassword" | "newPasswordConfirm";

export type ChangePasswordOutcome =
  | { kind: "ok"; message: string | null }
  | { kind: "login" }
  | { kind: "failed"; field: ChangePasswordField | null; message: string };

const FIELDS: readonly string[] = ["currentPassword", "newPassword", "newPasswordConfirm"];

export async function sendPasswordChange(input: { currentPassword: string; newPassword: string; newPasswordConfirm: string }): Promise<ChangePasswordOutcome> {
  const r = await postJson("/api/me/password", input, "비밀번호를 바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
  // 바뀌었지만 다른 기기 로그아웃을 못 했으면 서버가 다시 로그인하라는 문구를 싣는다
  if (r.kind === "ok") return { kind: "ok", message: typeof r.body.message === "string" ? r.body.message : null };
  if (r.status === 401) return { kind: "login" };
  const field = r.field !== null && FIELDS.includes(r.field) ? (r.field as ChangePasswordField) : null;
  return { kind: "failed", field, message: r.message };
}
