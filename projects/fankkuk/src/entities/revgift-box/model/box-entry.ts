import type { FanBoxState } from "./box-status";

// 크리에이터 상세의 선물함 입구(revgift-box INV-GB4·GB5·GB9 · 화면 명세 handle.md 「2026-11-11 선물함 칸」 상태 4개).
// 타일에 보이는 내 신청 뱃지와 상세 창의 버튼 하나를 정한다. 내 상태(myState·waitlistNo)는 선물함 화면과 같은 팬용 읽기(revgift_box_for_fan)가 돌려준 값 그대로다.
// 다른 신청자 수·받을 인원·대기 수는 보이지 않는다(정할 것 Q6).

export type BoxEntryAction = "apply" | "view" | "manage";
export type BoxEntry = { badge: string | null; action: BoxEntryAction };

/** 버튼 이름 — 문구 규칙 5(‘~하기’를 붙이지 않는다), 선물함 신청 화면의 「신청」과 같은 말 */
export const BOX_ENTRY_LABEL: Record<BoxEntryAction, string> = { apply: "신청", view: "신청 보기", manage: "신청 관리" };

/**
 * owner = 크리에이터 본인(box_owner) → 「신청 관리」, 뱃지 없음.
 * 정원 안 신청(box_applied) → 「신청함」 + 「신청 보기」 / 대기(box_waitlisted) → 「대기 N번」 + 「신청 보기」(순번을 모르면 뱃지 없이 「신청 보기」).
 * 신청하지 않았거나 취소했거나 상태를 모르면(로그인 전·팬 아님·읽기 실패 = null) → 「신청」(box_open).
 * preparing·closed(신청이 남은 채 다음 단계) → 뱃지 없이 「신청 보기」 — 신청 화면이 그 단계를 안내한다.
 */
export function boxEntryOf(input: { owner: boolean; myState: FanBoxState | null; waitlistNo: number | null }): BoxEntry {
  if (input.owner) return { badge: null, action: "manage" };
  switch (input.myState) {
    case "applied":
      return { badge: "신청함", action: "view" };
    case "waitlisted":
      return { badge: input.waitlistNo ? `대기 ${input.waitlistNo}번` : null, action: "view" };
    case "preparing":
    case "closed":
      return { badge: null, action: "view" };
    default:
      return { badge: null, action: "apply" };
  }
}

/** 버튼이 가는 곳 — 신청·신청 보기는 팬 선물함 화면, 신청 관리는 크리에이터 선물함 관리 화면 */
export function boxEntryHref(action: BoxEntryAction, boxId: string): string {
  const id = encodeURIComponent(boxId);
  return action === "manage" ? `/creator/revgift-boxes/${id}` : `/gift-boxes/${id}`;
}
