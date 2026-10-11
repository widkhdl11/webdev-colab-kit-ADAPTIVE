import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCreatorHandle } from "@/entities/creator/api/creator-link-reads";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { parseTogetherKey, togetherPath } from "@/entities/together/model/together-path";

// 「함께한 시간」 주소의 크리에이터 부분을 읽는다 (together 「스스로 정한 것」 주소). 로그인과 상관없는 공개 읽기 하나뿐이다 —
// 기록은 아직 읽지 않는다. 옛 링크 주소·ID 주소로 열면 지금 링크 주소로 넘기고(redirect), 꼴이 틀리거나 찾지 못하면 없는 페이지.
// - 링크 주소: 본인 확인된 크리에이터만 찾힌다(resolve_creator_handle) — 찾았으면 크리에이터 페이지가 열리는 크리에이터다.
// - ID: 본인 확인된 크리에이터면 공개 카드가 있다(creator_by_id). 카드에 링크 주소가 있으면 그리로 넘긴다.
//   카드가 없으면(본인 확인 전) 그 ID 그대로 보인다 — 기록은 남는다.

export type TogetherRoute =
  | { kind: "show"; creatorId: string }
  | { kind: "redirect"; to: string }
  | { kind: "not_found" };

export async function togetherRouteOf(client: Pick<SupabaseClient, "rpc">, key: string): Promise<TogetherRoute> {
  const parsed = parseTogetherKey(key);
  if (parsed.kind === "invalid") return { kind: "not_found" };
  if (parsed.kind === "handle") {
    const resolved = await resolveCreatorHandle(client, parsed.handle);
    if (!resolved) return { kind: "not_found" };
    if (resolved.handle !== parsed.handle) return { kind: "redirect", to: togetherPath({ id: resolved.creatorId, handle: resolved.handle }) };
    return { kind: "show", creatorId: resolved.creatorId };
  }
  const [card] = await readCreatorCards(client, { signedIn: false, onlyId: parsed.creatorId, followedIds: [] });
  if (card?.handle) return { kind: "redirect", to: togetherPath({ id: card.id, handle: card.handle }) };
  return { kind: "show", creatorId: parsed.creatorId };
}
