import type { SupabaseClient } from "@supabase/supabase-js";
import { readActionItems } from "@/entities/action-item/api/read-action-items";
import type { ActionItem } from "@/entities/action-item/model/action-items";
import { readMyApprovalRequests } from "@/entities/order/api/creator-request-rows";
import { readMyGiftViews } from "@/entities/order/api/fan-gift-rows";
import { fanBadge, headerGiftState } from "@/entities/order/ui/fan-stage-copy";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { homePathOf } from "@/entities/session/model/home-path";
import { readViewer, type Viewer } from "@/entities/session/model/viewer";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import type { HeaderGift, SiteHeaderProps } from "../ui/site-header";

// 로그인한 사람으로 헤더를 채운다. 사람 판정(readViewer)은 라우트가 한 번 하고 넘긴다.
// 운영자 화면은 아직 없어 운영자는 손님 헤더를 쓴다.
// 「배송 완료는 3일 뒤 사라짐」은 수령 시각이 기록에 없어 아직 적용하지 않는다(BACKLOG).

export function fanHeaderGifts(views: readonly FanGiftView[]): HeaderGift[] {
  return views.flatMap((v) => {
    const state = headerGiftState(v);
    return state ? [{ orderNo: v.orderNo, creatorName: v.creatorName, state, label: fanBadge(v).text }] : [];
  });
}

/**
 * 팬 화면이 선물 목록을 이미 읽었으면 gifts 로 넘겨 두 번 읽지 않는다.
 * 처리할 일도 같다 — 본문이 처리할 일을 그리는 화면(홈·처리할 일·선물 상세)은 한 번 읽은 결과를 actions 로 넘겨,
 * 사이드바 숫자와 본문이 같은 결과의 줄 수가 되게 한다(action-center INV-J2). 안 넘기면 같은 읽기 함수를 여기서 한 번 부른다.
 */
export async function readSiteHeader(
  client: Pick<SupabaseClient, "rpc">,
  viewer: Viewer | null,
  current?: string,
  gifts?: readonly FanGiftView[],
  actions?: readonly ActionItem[],
): Promise<SiteHeaderProps> {
  if (viewer?.role === "fan") {
    const [giftViews, actionItems] = await Promise.all([gifts ?? readMyGiftViews(client), actions ?? readActionItems(client)]);
    return { role: "fan", current, nickname: viewer.nickname ?? "", gifts: fanHeaderGifts(giftViews), actionCount: actionItems.length };
  }
  if (viewer?.role === "creator") {
    return { role: "creator", current, nickname: viewer.nickname ?? "", pendingCount: (await readMyApprovalRequests(client)).length };
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
