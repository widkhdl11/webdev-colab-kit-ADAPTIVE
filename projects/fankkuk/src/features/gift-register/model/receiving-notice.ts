import { isResting, limitReachedMessage, parseIsoDate, restingNotice, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";
import { movingNotice } from "./sender-rule";

/**
 * 선물 보내기 화면의 쉬는 중 안내 — 「선물 받기 일시 중단 · 10월 20일부터 재개」(creator-receiving INV-B2, 문구 3 다듬은본).
 * 쉬는 중인지는 restingNotice 와 같은 판정(isResting)이다. 크리에이터 페이지는 restingNotice 문구를 그대로 쓴다.
 */
export function restingStopText(resumeOn: string | null, today: CalendarDate): string | null {
  if (resumeOn === null || !isResting(resumeOn, today)) return null;
  const r = parseIsoDate(resumeOn);
  const when = r ? `${r.month}월 ${r.day}일` : resumeOn;
  return `선물 받기 일시 중단 · ${when}부터 재개`;
}

/**
 * 고른 크리에이터에게 지금 보낼 수 없으면 그 안내, 아니면 null (creator-receiving INV-B2·B6).
 * 쉬는 중이 먼저다 — 쉬는 동안은 한도와 상관없이 아무도 보낼 수 없다.
 * 화면 안내일 뿐이다. 등록은 DB 등록 함수가 같은 처리 안에서 다시 판정한다(화면을 연 뒤 쉬는 중이 돼도 막힌다).
 */
export function receivingNotice(
  picked: { receiving?: CreatorReceiving; limitReached?: boolean } | undefined,
  today: CalendarDate,
): string | null {
  const resting = restingStopText(picked?.receiving?.resumeOn ?? null, today);
  if (resting !== null) return resting;
  if (picked?.limitReached) return limitReachedMessage(today);
  return null;
}

/** 지금 보낼 수 없는 이유 — 채널 이사 중(INV-V12) · 쉬는 중(creator-receiving INV-B2) · 내 이번 달 한도(INV-B6) */
export type StopReason = "moving" | "resting" | "limit";

type Pickable = { moving?: boolean; receiving?: CreatorReceiving; limitReached?: boolean };

/**
 * 고른(또는 카드의) 크리에이터에게 지금 보낼 수 없는 이유, 없으면 null. 이사 중 → 쉬는 중 → 한도 순으로 하나만.
 * 1단계 회색 카드·둘째 줄 안내와 「다음」·결제 직전 판정(creatorBlockNotice)이 같은 이 판정을 쓴다(2026-10-22 d113 D-2) —
 * 화면 파일에서 따로 판정하면 회색 카드와 「다음」 차단이 서로 다르게 갈린다(리뷰 지적).
 */
export function stopReason(c: Pickable | undefined, today: CalendarDate): StopReason | null {
  if (!c) return null;
  if (movingNotice(c) !== null) return "moving";
  if (restingNotice(c.receiving?.resumeOn ?? null, today) !== null) return "resting";
  if (c.limitReached === true) return "limit";
  return null;
}

/** 「다음」·결제 직전에 보일 안내 — stopReason 과 같은 순서. 등록은 DB 가 다시 막는다 */
export function creatorBlockNotice(c: Pickable | undefined, today: CalendarDate): string | null {
  return movingNotice(c) ?? receivingNotice(c, today);
}
