// 승인 요청·승인 재알림 알림에 넣는 보낸 팬 표기 (notifications INV-N1 · notification-batching INV-NB3, 2026-11-04 카카오 검수 반려).
// 한 명이면 「별빛님」, 여럿이면 맨 앞 팬으로 「별빛님 외 2명」 — 사람 수는 서로 다른 팬 수다. 맨 앞이 누구인지와 사람 수는 DB 가 정한다
// (알림을 꺼내는 함수의 sender_name · sender_count). 템플릿의 `#{보내는사람}` 값이라 「님」까지 이 값에 들어간다(docs/copy/alimtalk-templates.md 2·3절).

/** 보낸 팬 표기. 맨 앞 팬 닉네임이 비었거나 사람 수가 1 이상의 정수가 아니면 null(그 알림톡은 보내지 않는다). */
export function approvalSenderLabel(firstNickname: string | null, fanCount: number | null): string | null {
  const name = firstNickname?.trim();
  if (!name || fanCount === null || !Number.isInteger(fanCount) || fanCount < 1) return null;
  return fanCount === 1 ? `${name}님` : `${name}님 외 ${fanCount - 1}명`;
}
