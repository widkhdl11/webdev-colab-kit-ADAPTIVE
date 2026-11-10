import type { SupabaseClient } from "@supabase/supabase-js";
import { readCreatorActionRows } from "@/entities/action-item/api/read-action-items";
import { withSignatureLinkItem, type CreatorActionItem } from "@/entities/action-item/model/creator-action-items";
import { readMySignatureLinkOrThrow } from "@/entities/creator/api/signature-link-reads";

// 크리에이터 처리할 일 읽기(action-center INV-J5·J6·J7) — DB 줄(entities/action-item)과 승인 서명 연결 여부(entities/creator)를 한 결과로 합친다.
// 한 화면에서 한 번 부르고 그 결과를 사이드바 숫자·홈 한 줄·처리할 일 목록에 함께 넘긴다(숫자는 줄 수 — 따로 세지 않는다).
// 연결 전이면 맨 앞에 승인 서명 연결 줄(signup INV-U20 · approval-signature INV-S16). 연결 여부를 못 읽으면 줄을 지어내지도 빼지도 않고 전체가 실패.

export async function readCreatorActionItems(client: Pick<SupabaseClient, "rpc">): Promise<CreatorActionItem[]> {
  const [rows, link] = await Promise.all([readCreatorActionRows(client), readMySignatureLinkOrThrow(client)]);
  return withSignatureLinkItem(rows, link.linked);
}

/** 숫자만 곁들이는 화면(사이드바·홈)용 — 못 읽으면 null(뱃지와 한 줄이 함께 빠진다) */
export async function readCreatorActionItemsOrNull(client: Pick<SupabaseClient, "rpc">): Promise<CreatorActionItem[] | null> {
  try {
    return await readCreatorActionItems(client);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "크리에이터 처리할 일을 읽지 못했다");
    return null;
  }
}
