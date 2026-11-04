import { describe, expect, it } from "vitest";
import { approvalSenderLabel } from "./sender-label";

describe("승인 요청 알림의 보낸 팬 표기 (INV-N1 · INV-NB3, 2026-11-04)", () => {
  it("INV-NB3: 한 명이면 「별빛님」, 여럿이면 「별빛님 외 N명」 — N 은 맨 앞 팬을 뺀 사람 수", () => {
    expect(approvalSenderLabel("별빛", 1)).toBe("별빛님");
    expect(approvalSenderLabel("별빛", 2)).toBe("별빛님 외 1명");
    expect(approvalSenderLabel("별빛", 3)).toBe("별빛님 외 2명");
    expect(approvalSenderLabel("  별빛 ", 1)).toBe("별빛님");
  });

  it("INV-NB3 (실패경로): 닉네임이 비었거나 사람 수가 1 이상의 정수가 아니면 만들지 않는다 — 빈 이름으로 보내지 않는다", () => {
    expect(approvalSenderLabel(null, 1)).toBeNull();
    expect(approvalSenderLabel("", 1)).toBeNull();
    expect(approvalSenderLabel("   ", 2)).toBeNull();
    expect(approvalSenderLabel("별빛", null)).toBeNull();
    expect(approvalSenderLabel("별빛", 0)).toBeNull();
    expect(approvalSenderLabel("별빛", 1.5)).toBeNull();
  });
});
