import { describe, expect, it } from "vitest";
import { parseBlockedSenderRows } from "./blocked-senders";

const row = { block_id: "6f1c2a52-0d55-4f0e-9a51-3f7a1f0d2b11", nickname: "하늘", blocked_at: "2026-10-05T01:00:00+00:00" };

describe("차단 목록 응답 (decline-block INV-D9)", () => {
  it("차단 줄 식별값·닉네임·차단한 때만 화면 모양으로. 시각은 ISO(Z)", () => {
    expect(parseBlockedSenderRows([row])).toEqual([
      { blockId: "6f1c2a52-0d55-4f0e-9a51-3f7a1f0d2b11", fanNickname: "하늘", blockedAt: "2026-10-05T01:00:00.000Z" },
    ]);
  });

  it("INV-D9: 다른 칸(아이디·계정 값)이 섞여 와도 화면 모양에 넣지 않는다", () => {
    const [view] = parseBlockedSenderRows([{ ...row, login_id: "haneul_fan", sender_id: "00000000-0000-4000-a000-000000000005" }]);
    expect(JSON.stringify(view)).not.toMatch(/haneul_fan|00000000-0000-4000-a000-000000000005/);
  });

  it("형식이 다르면 받지 않는다", () => {
    expect(() => parseBlockedSenderRows([{ ...row, block_id: "x" }])).toThrow();
    expect(() => parseBlockedSenderRows([{ ...row, blocked_at: null }])).toThrow();
  });
});
