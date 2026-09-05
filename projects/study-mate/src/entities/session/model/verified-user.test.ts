import { afterEach, describe, expect, it, vi } from "vitest";
import { readVerifiedUser, type SessionSource } from "./verified-user";

// 이 가짜는 세션을 읽는 두 경로를 **둘 다** 들고 있다. 한쪽만 주면
// "우리가 어느 쪽을 골랐는가"를 테스트가 붙들지 못한다.
const 위조된세션 = {
  data: { session: { user: { id: "위조로-만든-사용자" } } },
  error: null,
};

// 검증하지 않는 경로는 **어느 케이스에서도** 부르지 않는다 — 부르는 순간 그 값을 쓸 여지가 생긴다.
// 케이스 하나에만 단언을 붙이면 나머지 경로에서 몰래 부르는 구현이 통과한다.
const getSession = vi.fn(async () => 위조된세션);
afterEach(() => {
  expect(getSession).not.toHaveBeenCalled();
  getSession.mockClear();
});

function sourceOf(getClaims: SessionSource["getClaims"]): SessionSource {
  return { getClaims, getSession };
}

describe("readVerifiedUser", () => {
  it("INV-A3: 검증된 토큰의 클레임(sub)을 사용자 식별자로 삼는다", async () => {
    const source = sourceOf(async () => ({
      data: { claims: { sub: "진짜-사용자" } },
      error: null,
    }));

    await expect(readVerifiedUser(source)).resolves.toEqual({ id: "진짜-사용자" });
  });

  it("INV-A3: 토큰 검증이 실패하면, 세션 값에 사용자가 들어 있어도 비로그인으로 본다", async () => {
    const source = sourceOf(async () => ({ data: null, error: { message: "bad signature" } }));

    await expect(readVerifiedUser(source)).resolves.toBeNull();
  });

  it("INV-A3: 검증이 성공해도 클레임에 sub 가 없으면 비로그인으로 본다", async () => {
    const source = sourceOf(async () => ({ data: { claims: {} }, error: null }));

    await expect(readVerifiedUser(source)).resolves.toBeNull();
  });

  it("INV-A3: sub 가 빈 문자열이면 비로그인으로 본다", async () => {
    const source = sourceOf(async () => ({ data: { claims: { sub: "" } }, error: null }));

    // 빈 문자열을 통과시키면 { id: "" } 가 검증된 사용자로 나가고,
    // 그 값이 앞으로 작성자 식별자로 쓰인다.
    await expect(readVerifiedUser(source)).resolves.toBeNull();
  });

  it("INV-A3: sub 가 문자열이 아니면 비로그인으로 본다", async () => {
    const source = sourceOf(async () => ({ data: { claims: { sub: 12345 } }, error: null }));

    await expect(readVerifiedUser(source)).resolves.toBeNull();
  });

  it("INV-A3: 검증을 시도하다 예외가 나면(서버 미기동·네트워크 장애) 비로그인으로 본다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const source = sourceOf(async () => {
      throw new Error("fetch failed");
    });

    await expect(readVerifiedUser(source)).resolves.toBeNull();
    // 흔적이 없으면 "인증이 고장났다"와 "아무도 로그인 안 했다"가 겉이 같다.
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
