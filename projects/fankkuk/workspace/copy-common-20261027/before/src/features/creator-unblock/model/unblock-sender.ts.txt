import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";

// 차단 풀기 (decline-block INV-D10, 카드 d26 — 로그인 세션으로 한다).
// 요청한 사람의 세션 클라이언트로 DB 함수 unblock_sender 를 부른다 — DB 가 로그인 토큰으로 그 차단의 크리에이터인지 다시 확인한다.
// 본문에서는 차단 줄 식별값 하나만 꺼낸다. 풀어도 주소는 열리지 않는다 — 새 선물도 건마다 카카오 서명 승인이 있어야 나간다.

const inputSchema = z.object({ blockId: z.string().uuid() });

export type UnblockSenderResult = { ok: true } | { ok: false; status: 400 | 401 | 403 | 404; message: string };

export async function unblockSender(
  deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null },
  body: unknown,
): Promise<UnblockSenderResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 할 수 있어요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청이에요." };

  const { data, error } = await deps.client.rpc("unblock_sender", { p_block_id: parsed.data.blockId });
  if (error) throw new Error(`차단을 풀지 못했다: ${error.code}`);
  if (data === "unblocked") return { ok: true };
  if (data === "not_found") return { ok: false, status: 404, message: "이미 풀렸거나 찾을 수 없는 차단이에요. 새로 고침해 주세요." };
  throw new Error(`차단 풀기 결과를 알 수 없다: ${String(data)}`);
}
