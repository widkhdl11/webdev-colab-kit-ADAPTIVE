import { describe, expect, it, vi } from "vitest";
import { NO_SESSION_MESSAGE, requireSession } from "./require-session";
import type { VerifiedUser } from "./verified-user";

const 사용자: VerifiedUser = { id: "진짜-사용자" };

describe("requireSession", () => {
  it("INV-A4: 세션이 없으면 액션 본체를 아예 부르지 않는다", async () => {
    const 본체 = vi.fn(async () => ({ ok: true as const, value: "지웠다" }));
    const 액션 = requireSession(async () => null, 본체);

    await 액션();

    expect(본체).not.toHaveBeenCalled();
  });

  it("INV-A4(시나리오 S2): 세션이 없으면 실패와 함께 정해진 문구를 반환한다", async () => {
    const 액션 = requireSession(async () => null, async () => ({
      ok: true as const,
      value: "지웠다",
    }));

    await expect(액션()).resolves.toEqual({
      ok: false,
      message: "유저 정보를 찾을 수 없습니다",
    });
    expect(NO_SESSION_MESSAGE).toBe("유저 정보를 찾을 수 없습니다");
  });

  it("INV-A4: 세션 판독기가 예외를 던져도 본체를 부르지 않고 실패를 '반환'한다", async () => {
    const 본체 = vi.fn(async () => ({ ok: true as const, value: "지웠다" }));
    const 액션 = requireSession(async () => {
      throw new Error("네트워크 장애");
    }, 본체);

    await expect(액션()).resolves.toEqual({
      ok: false,
      message: NO_SESSION_MESSAGE,
    });
    expect(본체).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): 세션이 있으면 본체를 검증된 사용자와 함께 한 번 부르고 결과를 그대로 넘긴다", async () => {
    const 본체 = vi.fn(async (user: VerifiedUser, 대상: string) => ({
      ok: true as const,
      value: `${user.id}가 ${대상}를 지웠다`,
    }));
    const 액션 = requireSession(async () => 사용자, 본체);

    await expect(액션("스터디-1")).resolves.toEqual({
      ok: true,
      value: "진짜-사용자가 스터디-1를 지웠다",
    });
    expect(본체).toHaveBeenCalledTimes(1);
    expect(본체).toHaveBeenCalledWith(사용자, "스터디-1");
  });

  it("INV-A4: 본체가 실패를 반환하면 그 실패가 그대로 나온다(가드가 결과를 덮지 않는다)", async () => {
    const 액션 = requireSession(async () => 사용자, async () => ({
      ok: false as const,
      message: "이미 지워진 스터디입니다",
    }));

    await expect(액션()).resolves.toEqual({
      ok: false,
      message: "이미 지워진 스터디입니다",
    });
  });
});
