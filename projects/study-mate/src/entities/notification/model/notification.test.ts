/**
 * 알림 문장. 근거 스펙: docs/specs/notifications.md (INV-N6)
 *
 * 문장이 **저장된 값만으로** 만들어진다는 것을 이 파일이 붙든다 — 함수가 받는 것이
 * 종류와 그때의 제목 둘뿐이면, 지금의 원본을 읽어 문장을 지을 방법 자체가 없다.
 */
import { describe, expect, it } from "vitest";
import { NOTIFICATION_TYPES, isNotificationType, notificationSentence } from "./notification";

describe("알림 문장", () => {
  it("INV-N6: 다섯 종류가 저마다 다른 문장이 된다", () => {
    const tails = NOTIFICATION_TYPES.map((t) => notificationSentence(t, "토익 900").tail);

    expect(new Set(tails).size).toBe(NOTIFICATION_TYPES.length);
    for (const tail of tails) expect(tail.length).toBeGreaterThan(0);
  });

  it("INV-N6: 종류마다 무엇이라고 적는지를 문자열로 고정한다", () => {
    // **「서로 다르다」만 보면 안 된다.** 거절의 꼬리말을 「수락되었습니다」로 바꿔도
    // 다섯이 여전히 서로 달라서 초록불이고, 거절당한 사람 화면에 「수락되었습니다」가 뜬다
    // (2026-09-08 test-auditor).
    const 문장 = (t: string) => {
      const s = notificationSentence(t, "토익 900");
      return `${s.subject}${s.tail}`;
    };

    expect(문장("participation_requested")).toBe("토익 900에 새 참가 신청이 왔습니다");
    expect(문장("participation_accepted")).toBe("토익 900 참가가 수락되었습니다");
    expect(문장("participation_rejected")).toBe("토익 900 참가가 거절되었습니다");
    expect(문장("participation_kicked")).toBe("토익 900에서 내보내졌습니다");
    expect(문장("participation_withdrawn")).toBe("토익 900에서 한 명이 나갔습니다");
  });

  it("INV-N6: 제목은 받은 값 그대로 나온다 — 어디서도 다시 읽지 않는다", () => {
    expect(notificationSentence("participation_accepted", "그때의 제목").subject).toBe("그때의 제목");
  });

  it("INV-N6: 모르는 종류에도 문장이 나온다 — 못 그리는 것이 가장 나쁘다", () => {
    const s = notificationSentence("chat_message", "토익 900");

    expect(s.subject).toBe("토익 900");
    expect(s.tail.length).toBeGreaterThan(0);
  });

  it("데이터베이스가 묶어 둔 다섯만 아는 종류다", () => {
    expect(isNotificationType("participation_requested")).toBe(true);
    expect(isNotificationType("chat_message")).toBe(false);
    expect(isNotificationType(null)).toBe(false);
  });
});
