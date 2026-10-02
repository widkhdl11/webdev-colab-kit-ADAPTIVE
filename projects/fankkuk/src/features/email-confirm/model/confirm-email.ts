import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";

// 확인 메일의 링크 확인. 요청한 사람의 세션 클라이언트로 confirm_my_email 을 부른다 — 링크의 계정과 로그인한 계정이 같아야
// 하고, 한 번만·24시간 안·무효가 안 된 링크만 통과한다(INV-A7). 어느 조건에서 떨어졌는지는 알려 주지 않는다.

const inputSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });

export type ConfirmEmailResult =
  | { ok: true; email: string }
  | { ok: false; status: 400 | 401; message: string };

const UNUSABLE = "쓸 수 없는 링크예요. 내 정보에서 이메일을 다시 저장하면 새 확인 메일이 가요.";

export async function confirmEmail(
  deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null },
  body: unknown,
): Promise<ConfirmEmailResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: UNUSABLE };

  const { data, error } = await deps.client.rpc("confirm_my_email", { p_token: parsed.data.token });
  if (!error && typeof data === "string") return { ok: true, email: data };
  if (error?.code === "P0002") return { ok: false, status: 400, message: UNUSABLE };
  if (error?.code === "42501") return { ok: false, status: 401, message: "로그인이 필요해요." };
  throw new Error(`이메일 확인을 저장하지 못했다: ${error?.code ?? "응답 꼴"}`);
}
