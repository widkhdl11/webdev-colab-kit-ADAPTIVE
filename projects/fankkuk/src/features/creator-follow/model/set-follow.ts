import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";

// 팔로우 저장. 요청한 사람의 세션 클라이언트로 DB 함수 set_follow 를 부른다 — 관리자 키를 쓰지 않으므로
// DB 가 로그인 토큰으로 사람을 다시 확인한다. 본문에서는 크리에이터 id 와 켜고 끄기 두 칸만 꺼낸다(사람 칸은 읽지 않는다).

const inputSchema = z.object({
  creatorId: z.string().uuid(),
  following: z.boolean(),
});

export type SetFollowResult =
  | { ok: true; following: boolean }
  | { ok: false; status: 400 | 401 | 403 | 404; message: string };

export async function setFollow(
  deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null },
  body: unknown,
): Promise<SetFollowResult> {
  if (!deps.viewer)
    return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "fan")
    return { ok: false, status: 403, message: "팬 계정만 팔로우할 수 있어요." };

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success)
    return { ok: false, status: 400, message: "잘못된 요청이에요." };

  const { creatorId, following } = parsed.data;
  const { error } = await deps.client.rpc("set_follow", {
    p_creator_id: creatorId,
    p_following: following,
  });
  if (!error) return { ok: true, following };
  if (error.code === "P0002")
    return { ok: false, status: 404, message: "찾을 수 없는 크리에이터예요." };
  if (error.code === "42501")
    return { ok: false, status: 403, message: "팬 계정만 팔로우할 수 있어요." };
  throw new Error(`팔로우를 저장하지 못했다: ${error.code}`);
}
