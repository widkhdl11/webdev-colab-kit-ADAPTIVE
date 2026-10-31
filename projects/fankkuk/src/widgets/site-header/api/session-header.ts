import type { SupabaseClient } from "@supabase/supabase-js";
import { readActionItemsOrNull, readCreatorActionItemsOrNull } from "@/entities/action-item/api/read-action-items";
import { homePathOf } from "@/entities/session/model/home-path";
import { readViewer, type Viewer } from "@/entities/session/model/viewer";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import type { SiteHeaderProps } from "../ui/site-header";

// 로그인한 사람으로 헤더를 채운다. 사람 판정(readViewer)은 라우트가 한 번 하고 넘긴다.
// 운영자 화면은 아직 없어 운영자는 손님 헤더를 쓴다.
// 사이드바 숫자는 「지금 할 일」 하나뿐이라 선물 목록은 읽지도 넘기지도 않는다 — 주문번호·크리에이터 이름이 브라우저로 가지 않는다(v18 보안 리뷰 낮음 ①).

/**
 * 본문이 처리할 일을 그리는 화면(홈·처리할 일·선물 상세)은 한 번 읽은 결과를 actions 로 넘겨,
 * 사이드바 숫자와 본문이 같은 결과의 줄 수가 되게 한다(action-center INV-J2 · 크리에이터는 INV-J6). 안 넘기면 같은 읽기 함수를 여기서 한 번 부른다.
 * 팬은 팬 처리할 일 읽기(my_action_items), 크리에이터는 크리에이터 처리할 일 읽기(my_creator_action_items) — 승인 요청만 따로 세는 숫자는 없다.
 * 읽기가 실패했으면(null) 뱃지만 빼고 헤더는 그린다 — 숫자 하나 때문에 화면 전체가 실패하지 않게.
 */
export async function readSiteHeader(
  client: Pick<SupabaseClient, "rpc">,
  viewer: Viewer | null,
  current?: string,
  actions?: readonly unknown[] | null,
): Promise<SiteHeaderProps> {
  if (viewer?.role === "fan") {
    const actionItems = actions === undefined ? await readActionItemsOrNull(client) : actions;
    return { role: "fan", current, nickname: viewer.nickname ?? "", actionCount: actionItems?.length ?? 0, viewerId: viewer.userId };
  }
  if (viewer?.role === "creator") {
    const items = actions === undefined ? await readCreatorActionItemsOrNull(client) : actions;
    return { role: "creator", current, nickname: viewer.nickname ?? "", actionCount: items?.length ?? 0, viewerId: viewer.userId };
  }
  return { role: "guest", current };
}

/** 로그인한 사람의 첫 화면. 손님·운영자(아직 화면 없음)는 null. */
export function signedInHome(viewer: Viewer | null): string | null {
  return homePathOf(viewer?.role);
}

/** 라우트가 쓰는 한 줄: 요청한 사람의 세션 클라이언트와 확인된 사용자(INV-L2). */
export async function loadSession(): Promise<{ supabase: SupabaseClient; viewer: Viewer | null }> {
  const supabase = await createRequestSupabase();
  return { supabase, viewer: await readViewer(supabase) };
}
