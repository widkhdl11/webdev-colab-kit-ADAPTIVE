import { isResting, limitReachedMessage, restingMessage, type CalendarDate, type CreatorReceiving } from "@/entities/creator/model/receiving";

/**
 * 고른 크리에이터에게 지금 보낼 수 없으면 그 안내, 아니면 null (creator-receiving INV-B2·B6).
 * 쉬는 중이 먼저다 — 쉬는 동안은 한도와 상관없이 아무도 보낼 수 없다.
 * 화면 안내일 뿐이다. 등록은 DB 등록 함수가 같은 처리 안에서 다시 판정한다(화면을 연 뒤 쉬는 중이 돼도 막힌다).
 */
export function receivingNotice(
  picked: { receiving?: CreatorReceiving; limitReached?: boolean } | undefined,
  today: CalendarDate,
): string | null {
  const resumeOn = picked?.receiving?.resumeOn ?? null;
  if (resumeOn !== null && isResting(resumeOn, today)) return restingMessage(resumeOn);
  if (picked?.limitReached) return limitReachedMessage(today);
  return null;
}
