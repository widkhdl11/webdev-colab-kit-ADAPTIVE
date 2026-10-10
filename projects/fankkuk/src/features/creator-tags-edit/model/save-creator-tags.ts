import type { SupabaseClient } from "@supabase/supabase-js";
import { tagFilterMessage, tagSelectionSchema } from "@/entities/creator/model/creator-tags";
import type { Viewer } from "@/entities/session/model/viewer";

// 크리에이터 태그 저장 (creator-tags INV-T2·T3).
// 요청한 사람의 세션 클라이언트로 DB 함수를 부른다 — DB 가 로그인 토큰으로 크리에이터를 정하고(INV-T2) 규칙을 다시 검사한다(INV-T3).
// 넘기는 칸은 선택지 id 목록과 직접 입력뿐이다. 본문에 크리에이터 ID·계정 ID 가 있어도 읽지 않는다.

export type SaveCreatorTagsDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export type SaveCreatorTagsResult = { ok: true } | { ok: false; status: 400 | 401 | 403; message: string };

export async function saveCreatorTags(deps: SaveCreatorTagsDeps, body: unknown): Promise<SaveCreatorTagsResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 태그를 바꿀 수 있어요." };
  const parsed = tagSelectionSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "태그를 확인해 주세요." };
  const { tagIds, customTag } = parsed.data;
  const { error } = await deps.client.rpc("update_my_creator_tags", { p_option_ids: tagIds, p_custom_tag: customTag === "" ? null : customTag });
  if (!error) return { ok: true };
  // INV-T7: 직접 입력이 필터에 걸림 — 사유마다 문구
  const filtered = tagFilterMessage(error.code);
  if (filtered) return { ok: false, status: 400, message: filtered };
  if (error.code === "22023") return { ok: false, status: 400, message: "고를 수 없는 태그가 있거나 합쳐 5개를 넘었어요. 새로 고침한 뒤 다시 골라 주세요." };
  // 42501 은 두 경우 — 로그인 토큰이 없거나(401) 크리에이터 계정이 아니다(403). DB 문구로 가른다(update_my_creator_tags).
  if (error.code === "42501")
    return error.message.includes("크리에이터 계정만")
      ? { ok: false, status: 403, message: "크리에이터 계정만 태그를 바꿀 수 있어요." }
      : { ok: false, status: 401, message: "로그인이 필요해요." };
  throw new Error(`태그를 저장하지 못했다: ${error.code}`);
}
