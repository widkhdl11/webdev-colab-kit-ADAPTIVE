// 근거 스펙: docs/specs/password-change.md (INV-C1 · C2 · C5 · C6)
//
// **여기서 붙드는 것은 순서와 조건이다** — 확인이 먼저인가, 실패했을 때 그다음이 안 일어나는가.
// 「현재 비밀번호가 정말 맞는지」와 「다른 기기가 정말 끊기는지」는 가짜로는 알 수 없어서
// 실제 인증 서버에 붙는 검사가 따로 있다(tests/integration/password-change.test.ts).

import { describe, expect, it, vi } from "vitest";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import {
  changePassword,
  makeChangePassword,
  VERIFY_UNAVAILABLE,
  WRONG_CURRENT,
} from "./change-password";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111", email: "me@example.test" };

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  const 기본 = { current: "지금비밀번호", next: "새비밀번호1234" };
  for (const [k, v] of Object.entries({ ...기본, ...values })) form.append(k, v);
  return form;
}

/**
 * 인증 서버 대신 쓰는 가짜. **무엇을 어떤 순서로 불렀는지 기록한다** — 순서가 이 기능의
 * 계약이라(확인 → 변경 → 다른 기기 끊기) 호출 목록을 안 남기면 아무것도 안 붙든다.
 */
function 가짜인증(옵션: {
  확인실패?: { status?: number };
  다른계정?: string;
  변경실패?: { message: string };
  끊기실패?: { message: string };
} = {}) {
  const 부른것: string[] = [];
  const 사용자id = 옵션.다른계정 ?? 사용자.id;
  const 확인용 = {
    auth: {
      signInWithPassword: vi.fn(async (creds: { email: string; password: string }) => {
        부른것.push(`확인(${creds.email}, ${creds.password})`);
        return {
          data: { user: { id: 사용자id } },
          error: 옵션.확인실패
            ? { message: "Invalid login credentials", status: 옵션.확인실패.status ?? 400 }
            : null,
        };
      }),
      signOut: vi.fn(async (opts?: { scope?: string }) => {
        부른것.push(`확인용로그아웃(${opts?.scope})`);
        return { error: null };
      }),
    },
  };
  const 세션용 = {
    auth: {
      updateUser: vi.fn(async (attrs: { password?: string }) => {
        부른것.push(`변경(${attrs.password})`);
        return { error: 옵션.변경실패 ?? null };
      }),
      signOut: vi.fn(async (opts?: { scope?: string }) => {
        부른것.push(`로그아웃(${opts?.scope})`);
        return { error: 옵션.끊기실패 ?? null };
      }),
    },
  };
  const createVerifier = vi.fn(async () => 확인용);
  const createSession = vi.fn(async () => 세션용);
  return { 부른것, 확인용, 세션용, createVerifier, createSession };
}

function 붙이기(가짜: ReturnType<typeof 가짜인증>) {
  return {
    createVerifier: 가짜.createVerifier as never,
    createSession: 가짜.createSession as never,
  };
}

describe("비밀번호 변경", () => {
  it("INV-C1: 현재 비밀번호가 틀리면 변경을 부르지도 않는다", async () => {
    const 가짜 = 가짜인증({ 확인실패: {} });

    const 결과 = await changePassword(사용자, 폼(), 붙이기(가짜));

    expect(결과).toEqual({ ok: false, message: WRONG_CURRENT });
    expect(가짜.세션용.auth.updateUser).not.toHaveBeenCalled();
    expect(가짜.세션용.auth.signOut).not.toHaveBeenCalled();
  });

  it("INV-C1(반대 절반): 맞으면 폼의 새 비밀번호로 바꾼다", async () => {
    const 가짜 = 가짜인증();

    const 결과 = await changePassword(사용자, 폼({ next: "아주새로운비밀번호" }), 붙이기(가짜));

    expect(결과.ok).toBe(true);
    expect(가짜.부른것).toEqual([
      "확인(me@example.test, 지금비밀번호)",
      // 확인이 만든 세션은 **그 자리에서** 끊는다. 범위가 local 이 아니면 지금 기기까지
      // 끊겨서 INV-C3 의 뒤쪽 절반이 깨진다
      "확인용로그아웃(local)",
      "변경(아주새로운비밀번호)",
      "로그아웃(others)",
    ]);
    expect(결과.ok).toBe(true);
    if (결과.ok) expect(결과.value.othersSignedOut).toBe(true);
  });

  it("INV-C1: 확인에 쓰는 이메일은 폼이 아니라 세션에서 온다", async () => {
    const 가짜 = 가짜인증();

    // 폼에 남의 이메일을 넣어도 무시된다. 이것이 없으면 남의 계정으로 확인을 통과시켜
    // **내 세션의 비밀번호를 바꾸는** 조합이 열린다
    await changePassword(사용자, 폼({ email: "남@example.test" }), 붙이기(가짜));

    expect(가짜.부른것[0]).toBe("확인(me@example.test, 지금비밀번호)");
  });

  it("INV-C2: 확인이 끝날 때까지 세션 클라이언트를 만들지도 않는다", async () => {
    const 가짜 = 가짜인증({ 확인실패: {} });

    await changePassword(사용자, 폼(), 붙이기(가짜));

    // 전에는 `"signInWithPassword" in 세션용.auth` 를 봤는데, 그 키는 가짜가 애초에
    // 정의하지 않으므로 구현이 무엇을 하든 항상 참이었다 — 자기 가짜를 검사하는
    // 동어반복이다(2026-09-06 test-auditor). 확인이 실패하면 세션 클라이언트를 **만들지도
    // 않는다**는 것이 실제로 붙들 수 있는 사실이다.
    expect(가짜.createVerifier).toHaveBeenCalledTimes(1);
    expect(가짜.createSession).not.toHaveBeenCalled();
  });

  it("INV-C1: 확인이 통과한 계정이 이 세션의 계정이 아니면 안 바꾼다", async () => {
    const 가짜 = 가짜인증({ 다른계정: "88888888-8888-4888-8888-888888888888" });

    const 결과 = await changePassword(사용자, 폼(), 붙이기(가짜));

    expect(결과).toEqual({ ok: false, message: WRONG_CURRENT });
    expect(가짜.세션용.auth.updateUser).not.toHaveBeenCalled();
  });

  it("확인이 요청 제한으로 막히면 「틀렸다」고 말하지 않는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const 가짜 = 가짜인증({ 확인실패: { status: 429 } });

    const 결과 = await changePassword(사용자, 폼(), 붙이기(가짜));

    // 맞게 적은 사람에게 「맞지 않습니다」가 뜨면 자기 비밀번호를 의심하며 계속 시도한다
    expect(결과).toEqual({ ok: false, message: VERIFY_UNAVAILABLE });
    로그.mockRestore();
  });

  it("INV-C3: 다른 기기 끊기가 실패하면 끊었다고 말하지 않는다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const 가짜 = 가짜인증({ 끊기실패: { message: "network" } });

    const 결과 = await changePassword(사용자, 폼(), 붙이기(가짜));

    // 비밀번호는 바뀌었으므로 실패로 뒤집지 않는다(INV-C5 를 반대로 어긴다).
    // 대신 화면이 다른 문구를 고를 수 있게 값으로 알린다.
    expect(결과.ok).toBe(true);
    if (결과.ok) expect(결과.value.othersSignedOut).toBe(false);
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });

  it("INV-C1: 세션에 이메일이 없으면 인증 서버를 부르지도 않는다", async () => {
    const 가짜 = 가짜인증();

    const 결과 = await changePassword({ id: 사용자.id }, 폼(), 붙이기(가짜));

    // 확인을 못 한 것과 확인한 것이 같은 결과가 되면 INV-C1 이 조용히 사라진다
    expect(결과.ok).toBe(false);
    expect(가짜.부른것).toEqual([]);
  });

  it("비밀번호는 자르지 않는다 — 공백도 비밀번호의 일부다", async () => {
    const 가짜 = 가짜인증();

    await changePassword(사용자, 폼({ current: " 앞뒤공백 ", next: " 새것 " }), 붙이기(가짜));

    // 자르면 끝에 공백이 있는 비밀번호를 쓰는 사람은 맞게 쳐도 영영 확인을 통과 못 하고,
    // 공백이 든 새 비밀번호는 잘린 값이 저장돼 방금 정한 대로 쳐도 로그인이 안 된다
    expect(가짜.부른것[0]).toBe("확인(me@example.test,  앞뒤공백 )");
    expect(가짜.부른것).toContain("변경( 새것 )");
  });

  it("INV-C5: 변경이 실패하면 성공이라 하지 않고 다른 기기도 안 끊는다", async () => {
    const 가짜 = 가짜인증({ 변경실패: { message: "Password should be at least 6 characters" } });

    const 결과 = await changePassword(사용자, 폼(), 붙이기(가짜));

    expect(결과.ok).toBe(false);
    expect(가짜.세션용.auth.signOut).not.toHaveBeenCalled();
  });

  it("INV-C4: 새 비밀번호의 사유는 인증 서버가 준 문장을 그대로 보여 준다", async () => {
    const 가짜 = 가짜인증({ 변경실패: { message: "Password should be at least 6 characters" } });

    const 결과 = await changePassword(사용자, 폼(), 붙이기(가짜));

    expect(결과.ok).toBe(false);
    if (!결과.ok) expect(결과.message).toContain("at least 6 characters");
  });

  it("INV-C6: 세션이 없으면 인증 서버를 부르지도 않는다", async () => {
    const 가짜 = 가짜인증();
    const 액션 = makeChangePassword(async () => null, 붙이기(가짜));

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(가짜.부른것).toEqual([]);
  });

  it("빈칸은 인증 서버에 보내기 전에 막는다", async () => {
    const 가짜 = 가짜인증();

    const 결과 = await changePassword(사용자, 폼({ current: "", next: "" }), 붙이기(가짜));

    expect(결과.ok).toBe(false);
    expect(가짜.부른것).toEqual([]);
  });

  it("새 비밀번호가 지금 것과 같으면 바꾸지 않는다", async () => {
    const 가짜 = 가짜인증();

    const 결과 = await changePassword(사용자, 폼({ next: "지금비밀번호" }), 붙이기(가짜));

    expect(결과.ok).toBe(false);
    expect(가짜.세션용.auth.updateUser).not.toHaveBeenCalled();
  });
});
