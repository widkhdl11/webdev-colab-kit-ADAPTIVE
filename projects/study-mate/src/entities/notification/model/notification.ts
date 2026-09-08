// 알림의 어휘와 문장. 근거 스펙: docs/specs/notifications.md (INV-N6)
//
// **문장을 여기서 짓는 이유**는 알림이 "그때 이런 일이 있었다"는 사실 기록이기 때문이다.
// 화면에 나갈 문장은 **저장된 값**(종류 + 그때의 스터디 제목)으로만 만든다. 지금의 원본을
// 다시 읽어 지으면 스터디 이름이 바뀔 때 지난 알림의 문장까지 같이 바뀌고, 원본이 사라진
// 알림은 문장 자체를 잃는다.

/** 데이터베이스의 검사 제약(`notifications_type_allowed`)이 묶어 둔 다섯. */
export const NOTIFICATION_TYPES = [
  "participation_requested",
  "participation_accepted",
  "participation_rejected",
  "participation_kicked",
  "participation_withdrawn",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** 패널이 그리는 알림 한 줄. */
export type MyNotification = {
  readonly id: string;
  readonly type: string;
  /** 그때의 스터디 제목. 지금 제목이 아니다 */
  readonly title: string;
  readonly createdAt: string;
  /** null 이면 안 읽음 */
  readonly readAt: string | null;
  /**
   * 누를 수 있는 주소. **가리키는 대상이 지금 그 사람에게 안 보이면 null 이다**(INV-N7) —
   * 그 상태에서 링크를 그리면 누르지 않아도 미리 가져오기가 404 를 만든다.
   */
  readonly href: string | null;
  /**
   * 가리키는 대상이 **사라진 것을 확인했나.** `href` 가 없는 이유가 둘이라 나눠 둔다 —
   * 실제로 안 보이는 것과, 보이는지 물어봤는데 답을 못 받은 것.
   *
   * 링크는 두 경우 다 안 건다(모르면 안 거는 쪽이 안전하다). 다른 것은 화면이 하는 말이다:
   * **답을 못 받았는데 「지워진 스터디예요」라고 적으면 화면이 사실이 아닌 것을 단정한다** —
   * 조회가 한 번 실패하면 멀쩡히 살아 있는 스터디 100개가 전부 지워진 것으로 표시된다
   * (2026-09-08 security-reviewer).
   */
  readonly gone: boolean;
};

/**
 * 알림 문장을 제목과 나머지로 나눠 준다. 화면이 제목만 굵게 그릴 수 있어야 해서
 * 한 문자열로 합치지 않는다.
 */
export type NotificationSentence = {
  /** 그때의 스터디 제목 */
  readonly subject: string;
  /** 제목 뒤에 붙는 말 */
  readonly tail: string;
};

const TAILS: Record<NotificationType, string> = {
  participation_requested: "에 새 참가 신청이 왔습니다",
  participation_accepted: " 참가가 수락되었습니다",
  participation_rejected: " 참가가 거절되었습니다",
  participation_kicked: "에서 내보내졌습니다",
  participation_withdrawn: "에서 한 명이 나갔습니다",
};

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

/**
 * **모르는 종류에도 문장이 나온다.** 지금은 데이터베이스가 다섯으로 묶어 두지만, 종류를
 * 늘리는 마이그레이션이 화면보다 먼저 배포되는 순간이 있다. 그때 빈 줄이나 예외가 아니라
 * "무슨 일이 있었다"가 나와야 한다 — 알림은 사실 기록이라 못 그리는 것이 가장 나쁘다.
 */
export function notificationSentence(type: string, title: string): NotificationSentence {
  return {
    subject: title,
    tail: isNotificationType(type) ? TAILS[type] : "에 새 소식이 있습니다",
  };
}

/**
 * 안 읽음인가. **이 판정을 화면에 두지 않는다** — 「`readAt` 이 null 이면 안 읽음」은
 * 표시 규칙이 아니라 도메인 규칙이고, 화면 두 곳에서 각각 다시 쓰면 한쪽만 고쳐지는 날
 * 띠는 붙는데 숫자는 안 세는 상태가 된다.
 */
export const isUnread = (n: MyNotification): boolean => n.readAt === null;

/** 안 읽은 줄 수. 종 옆 숫자의 근거다(INV-N8). */
export const countUnread = (list: readonly MyNotification[]): number =>
  list.filter(isUnread).length;

/**
 * 한 줄을 읽음으로 옮긴 목록. **이미 읽은 줄의 시각은 안 건드린다** — 읽은 시각은 그때
 * 서버가 기록한 값이고, 여기서 덮어쓰면 화면이 들고 있는 값이 데이터베이스와 달라진다.
 *
 * `at` 을 인자로 받는 이유: 시각을 함수 안에서 만들면 검사가 결과를 단언할 수 없다.
 */
export function markReadIn(
  list: readonly MyNotification[],
  id: string,
  at: string,
): readonly MyNotification[] {
  return list.map((n) => (n.id === id && isUnread(n) ? { ...n, readAt: at } : n));
}

/** 안 읽은 줄 전부를 읽음으로 옮긴 목록. */
export function markAllReadIn(
  list: readonly MyNotification[],
  at: string,
): readonly MyNotification[] {
  return list.map((n) => (isUnread(n) ? { ...n, readAt: at } : n));
}

/** 그 줄을 뺀 목록. */
export function removeFrom(
  list: readonly MyNotification[],
  id: string,
): readonly MyNotification[] {
  return list.filter((n) => n.id !== id);
}
