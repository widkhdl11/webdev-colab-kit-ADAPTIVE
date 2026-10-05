import type { ViewerRole } from "@/entities/session/model/viewer";

// 누가 이 크리에이터에게 선물을 보낼 수 있는가 (session-login INV-L3·INV-L8·INV-L9).
// - 보내는 사람: 팬·크리에이터. 운영자는 못 보낸다(INV-L3).
// - 크리에이터는 자기 자신에게 못 보낸다(INV-L8).
// - 크리에이터 → 크리에이터는 팔로우가 한쪽이라도 있어야 한다(INV-L9). 팬에게는 이 조건이 없다.

/** 보내는 크리에이터와 받는 크리에이터 사이. 팬이 보낼 때는 읽지 않는다. */
export type CreatorRelation = { receiverIsSelf: boolean; followEitherWay: boolean };

/** moving = 받는 크리에이터가 채널 이사 중(creator-verification INV-V12) — DB 등록 함수만 판정한다(화면은 안내만). */
export type SenderRefusal = "role" | "self" | "no_follow" | "unknown_creator" | "moving";
export type SenderVerdict = { ok: true } | { ok: false; reason: SenderRefusal };

/** 역할만으로 정해지는 부분. 크리에이터면 관계를 더 봐야 한다(needsRelation). */
export function senderRoleAllowed(role: ViewerRole): boolean {
  return role === "fan" || role === "creator";
}

export function needsRelation(role: ViewerRole): boolean {
  return role === "creator";
}

export function decideSender(role: ViewerRole, relation: CreatorRelation | null): SenderVerdict {
  if (!senderRoleAllowed(role)) return { ok: false, reason: "role" };
  if (!needsRelation(role)) return { ok: true };
  // 받는 크리에이터를 찾지 못했으면 보내지 않는다(없는 크리에이터)
  if (!relation) return { ok: false, reason: "unknown_creator" };
  if (relation.receiverIsSelf) return { ok: false, reason: "self" };
  if (!relation.followEitherWay) return { ok: false, reason: "no_follow" };
  return { ok: true };
}

export const SENDER_REFUSAL_MESSAGE: Record<SenderRefusal, string> = {
  role: "팬이나 크리에이터 계정으로 로그인해야 선물을 보낼 수 있어요.",
  self: "자기 자신에게는 선물을 보낼 수 없어요.",
  no_follow: "서로 팔로우하거나 한쪽이라도 팔로우한 크리에이터에게만 선물을 보낼 수 있어요.",
  unknown_creator: "선물을 받을 수 없는 크리에이터예요.",
  moving: "채널을 옮기는 중인 크리에이터라 지금은 선물을 받을 수 없어요. 채널 확인이 끝나면 다시 보내 주세요.",
};

/** 거부 응답 상태 — 없는(또는 본인 확인 전) 크리에이터는 404, 채널 이사 중은 409(때가 지나면 풀린다), 나머지는 403. */
export function refusalStatus(reason: SenderRefusal): 403 | 404 | 409 {
  if (reason === "moving") return 409;
  return reason === "unknown_creator" ? 404 : 403;
}

/**
 * INV-V12: 고른 크리에이터가 채널 이사 중이면 1단계에서 넘어가지 못하게 할 안내 문구. 아니면 null.
 * 화면 안내일 뿐이다 — 등록은 DB 등록 함수가 같은 처리 안에서 다시 판정한다(화면을 연 뒤 이사가 시작돼도 막힌다).
 */
export function movingNotice(picked: { moving?: boolean } | undefined): string | null {
  return picked?.moving ? SENDER_REFUSAL_MESSAGE.moving : null;
}

// ── 화면 표시용 (판정은 등록 때 서버·DB 가 다시 한다) ─────────────

/** 크리에이터 페이지의 「선물 보내기」 자리. 팬·손님은 늘 open(로그인은 결제할 때 서버가 요구한다). */
export type SendAvailability = "open" | "self" | "needs_follow";

export function sendAvailabilityOf(input: {
  viewerRole: ViewerRole | null;
  creatorId: string;
  ownCreatorId: string | null;
  canSend: boolean;
}): SendAvailability {
  if (input.viewerRole !== "creator") return "open";
  if (input.ownCreatorId !== null && input.creatorId === input.ownCreatorId) return "self";
  return input.canSend ? "open" : "needs_follow";
}

/**
 * 크리에이터가 보는 선물 보내기 목록: 내가 팔로우한 크리에이터(자기 자신 빼고) + 미리 고른 사람이 보낼 수 있는 사람이면 그 사람.
 * 나를 팔로우한 크리에이터를 목록으로 모아 보여 주지 않는다 — 그 명단이 드러나기 때문이다(받는 쪽만 팔로우한 경우는
 * 크리에이터 페이지에서 한 명씩 확인해 들어온다).
 */
export function creatorSendList<T extends { id: string; following: boolean }>(
  cards: readonly T[],
  ownCreatorId: string | null,
  preselected: { id: string; canSend: boolean } | null,
): T[] {
  return cards.filter(
    (c) => c.id !== ownCreatorId && (c.following || (preselected !== null && preselected.canSend && c.id === preselected.id)),
  );
}

/** 결제 확정을 요청한 사람 — 선물을 보낼 수 있는 역할(팬·크리에이터)이면 그 ID, 아니면 null(확정하지 않는다, INV-L3). */
export function checkoutRequesterId(viewer: { userId: string; role: ViewerRole } | null): string | null {
  return viewer && senderRoleAllowed(viewer.role) ? viewer.userId : null;
}
