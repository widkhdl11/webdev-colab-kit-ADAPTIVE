import type { ViewerRole } from "@/entities/session/model/viewer";

// 누가 이 크리에이터에게 선물을 보낼 수 있는가 (session-login INV-L3·INV-L8·INV-L9).
// - 보내는 사람: 팬·크리에이터. 운영자는 못 보낸다(INV-L3).
// - 크리에이터는 자기 자신에게 못 보낸다(INV-L8).
// - 팬·크리에이터 모두 보내는 사람이 받는 크리에이터를 팔로우하고 있어야 한다(INV-L9, 2026-10-07 바뀜 — 카드 d41).
//   받는 쪽이 보내는 쪽을 팔로우한 것은 세지 않는다.

/** 보내는 사람과 받는 크리에이터 사이. receiverIsSelf 는 크리에이터가 자기 페이지로 보낼 때만 참이 된다. */
export type CreatorRelation = { receiverIsSelf: boolean; senderFollows: boolean };

/** moving = 받는 크리에이터가 채널 이사 중(creator-verification INV-V12) — DB 등록 함수만 판정한다(화면은 안내만). */
/** resting·limit = 받는 크리에이터가 쉬는 중·이번 달 한도에 닿음(creator-receiving INV-B2·B4) — 역시 DB 등록 함수가 판정한다. */
/** hard_item = 고른 종류를 크리에이터가 「등록 막기」로 둠(hard-items INV-H7) — DB 등록 함수가 판정한다. */
export type SenderRefusal = "role" | "self" | "no_follow" | "unknown_creator" | "moving" | "resting" | "limit" | "hard_item";
export type SenderVerdict = { ok: true } | { ok: false; reason: SenderRefusal };

/** 역할만으로 정해지는 부분. 허락된 역할이면 관계(decideSender)를 더 본다. */
export function senderRoleAllowed(role: ViewerRole): boolean {
  return role === "fan" || role === "creator";
}

export function decideSender(role: ViewerRole, relation: CreatorRelation | null): SenderVerdict {
  if (!senderRoleAllowed(role)) return { ok: false, reason: "role" };
  // 받는 크리에이터를 찾지 못했으면 보내지 않는다(없는 크리에이터)
  if (!relation) return { ok: false, reason: "unknown_creator" };
  if (relation.receiverIsSelf) return { ok: false, reason: "self" };
  if (!relation.senderFollows) return { ok: false, reason: "no_follow" };
  return { ok: true };
}

export const SENDER_REFUSAL_MESSAGE: Record<SenderRefusal, string> = {
  role: "팬이나 크리에이터 계정으로 로그인해야 선물을 보낼 수 있어요.",
  self: "자기 자신에게는 선물을 보낼 수 없어요.",
  no_follow: "팔로우한 크리에이터에게만 선물을 보낼 수 있어요.",
  unknown_creator: "선물을 받을 수 없는 크리에이터예요.",
  moving: "채널을 옮기는 중인 크리에이터라 지금은 선물을 받을 수 없어요. 채널 확인이 끝나면 다시 보내 주세요.",
  resting: "지금은 잠시 선물 받기를 쉬고 있는 크리에이터예요.",
  // INV-B6: 실제 문구는 다음 달 1일을 넣어 등록 처리가 만든다(limitReachedMessage) — 이 값은 날짜를 모를 때만
  limit: "이번 달은 이미 마음을 충분히 보내셨어요. 다음 달 1일부터 다시 보낼 수 있어요",
  // hard-items INV-H7: 실제 문구는 고른 품목을 넣어 등록 처리가 만든다(hardItemRefusalMessage) — 이 값은 품목을 모를 때만
  hard_item: "지금은 이 품목을 받기 어려운 크리에이터예요. 다른 선물을 골라 주세요.",
};

/** 거부 응답 상태 — 없는(또는 본인 확인 전) 크리에이터는 404, 채널 이사 중·쉬는 중·한도·받기 어려운 품목은 409(때가 지나면 풀린다), 나머지는 403. */
export function refusalStatus(reason: SenderRefusal): 403 | 404 | 409 {
  if (reason === "moving" || reason === "resting" || reason === "limit" || reason === "hard_item") return 409;
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

/** 크리에이터 페이지·카드의 「선물 보내기」 자리. needs_follow 면 「팔로우하고 선물 보내기」(손님은 누르면 로그인으로). */
export type SendAvailability = "open" | "self" | "needs_follow";

export function sendAvailabilityOf(input: {
  viewerRole: ViewerRole | null;
  creatorId: string;
  ownCreatorId: string | null;
  /** 보는 사람이 이 크리에이터를 팔로우하고 있는가(손님은 false) */
  following: boolean;
}): SendAvailability {
  if (input.viewerRole === "creator" && input.ownCreatorId !== null && input.creatorId === input.ownCreatorId) return "self";
  return input.following ? "open" : "needs_follow";
}

/** 선물 보내기 목록: 내가 팔로우한 크리에이터만(INV-L9), 크리에이터면 자기 자신은 뺀다(INV-L8). 등록 판정은 서버·DB 가 다시 한다. */
export function sendList<T extends { id: string; following: boolean }>(cards: readonly T[], ownCreatorId: string | null): T[] {
  return cards.filter((c) => c.following && c.id !== ownCreatorId);
}

/** 결제 확정을 요청한 사람 — 선물을 보낼 수 있는 역할(팬·크리에이터)이면 그 ID, 아니면 null(확정하지 않는다, INV-L3). */
export function checkoutRequesterId(viewer: { userId: string; role: ViewerRole } | null): string | null {
  return viewer && senderRoleAllowed(viewer.role) ? viewer.userId : null;
}
