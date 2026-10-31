import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATOR_ACTION_CENTER_HREF } from "@/entities/action-item/model/creator-action-items";
import { LINK_LOGIN_SUCCESS_PATH, loginLinkTokenHash, newLoginLinkToken } from "@/entities/session/model/login-link";
import { linkSignIn, type LinkSignInDeps } from "./link-sign-in";

// 로그인 링크의 토큰으로 로그인 (docs/specs/link-login.md INV-K2·K4·K5).
// 토큰 쓰기는 DB 함수가 한 번만 하고(INV-K2 — 통합 시험), 여기서는 그 결과로 무엇을 부르는지 본다.

const ACCOUNT = "00000000-0000-4000-a000-000000000012";
const OTHER = "00000000-0000-4000-a000-000000000001";

function fakes(opts: { consumed?: string | null; current?: string | null; email?: string | null; verifyError?: boolean; env?: Record<string, string> } = {}) {
  const calls: string[] = [];
  const consumedWith: string[] = [];
  const logs: string[] = [];
  const deps: LinkSignInDeps = {
    links: {
      async consume(hash) {
        calls.push("consume");
        consumedWith.push(hash);
        return opts.consumed === undefined ? ACCOUNT : opts.consumed;
      },
    },
    authAdmin: {
      async getUserById(id) {
        calls.push(`getUserById:${id}`);
        const email = opts.email === undefined ? "momo_creator@login.fankkuk.invalid" : opts.email;
        return { data: { user: email ? { id, email } : null }, error: null };
      },
      async generateLink(params) {
        calls.push(`generateLink:${params.type}:${params.email}`);
        return { data: { properties: { hashed_token: "hashed-otp" } }, error: null };
      },
    },
    auth: {
      async getUser() {
        calls.push("getUser");
        const id = opts.current ?? null;
        return id ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { message: "no session" } };
      },
      async signOut(o?: { scope?: string }) {
        calls.push(`signOut:${o?.scope}`);
        return { error: null };
      },
      async verifyOtp(params: { token_hash?: string; type: string }) {
        calls.push(`verifyOtp:${params.token_hash ?? "?"}:${params.type}`);
        return opts.verifyError ? { data: { user: null, session: null }, error: { message: "bad" } } : { data: { user: { id: ACCOUNT }, session: {} }, error: null };
      },
    } as unknown as LinkSignInDeps["auth"],
    env: opts.env ?? { NODE_ENV: "development" },
    log: (line) => logs.push(line),
  };
  return { deps, calls, consumedWith, logs };
}

afterEach(() => vi.restoreAllMocks());

describe("INV-K4: 토큰을 쓰면 그 계정으로 로그인", () => {
  it("INV-K4: 성공 뒤 가는 곳은 처리할 일(승인 대기 목록) 경로와 같다", () => {
    expect(LINK_LOGIN_SUCCESS_PATH).toBe(CREATOR_ACTION_CENTER_HREF);
  });

  it("INV-K4 (S1): 토큰 해시로 쓰고 → 그 계정의 주소로 1회용 값을 만들어 → 요청 세션으로 확인한다", async () => {
    const { token } = newLoginLinkToken();
    const { deps, calls, consumedWith } = fakes();
    expect(await linkSignIn(deps, { t: token })).toEqual({ outcome: "signed_in", accountId: ACCOUNT });
    expect(consumedWith).toEqual([loginLinkTokenHash(token)]);
    expect(calls).toEqual([
      "getUser",
      "consume",
      `getUserById:${ACCOUNT}`,
      "generateLink:magiclink:momo_creator@login.fankkuk.invalid",
      "verifyOtp:hashed-otp:magiclink",
    ]);
  });

  it("INV-K1 · INV-K5 (S3): DB 에는 원문이 아니라 해시만 간다", async () => {
    const { token } = newLoginLinkToken();
    const { deps, consumedWith } = fakes();
    await linkSignIn(deps, { t: token });
    expect(consumedWith[0]).not.toContain(token);
    expect(consumedWith[0]).toMatch(/^[0-9a-f]{64}$/);
  });

});

describe("INV-K4 (카드 d1): 이미 로그인해 있으면 링크로 계정을 바꾸지 않는다", () => {
  it("INV-K4: 토큰의 계정과 같으면 그 로그인 그대로 — 새 로그인 값을 만들지 않고 세션도 끝내지 않는다", async () => {
    const { deps, calls } = fakes({ current: ACCOUNT });
    expect(await linkSignIn(deps, { t: newLoginLinkToken().token })).toEqual({ outcome: "kept" });
    expect(calls).toEqual(["getUser", "consume"]);
  });

  it("INV-K4 (실패경로): 토큰의 계정과 다르면 지금 세션을 끝내고(로그아웃) 링크 계정으로 로그인하지 않는다", async () => {
    const { deps, calls } = fakes({ current: OTHER });
    expect(await linkSignIn(deps, { t: newLoginLinkToken().token })).toEqual({ outcome: "signed_out" });
    expect(calls).toEqual(["getUser", "consume", "signOut:local"]);
    expect(calls.some((c) => c.startsWith("generateLink") || c.startsWith("verifyOtp") || c.startsWith("getUserById"))).toBe(false);
  });

  it("INV-K4 (실패경로): 토큰을 쓸 수 없으면(없음·씀·만료) 그 로그인 그대로 — 세션을 끝내지 않는다", async () => {
    const { deps, calls } = fakes({ current: OTHER, consumed: null });
    expect(await linkSignIn(deps, { t: newLoginLinkToken().token })).toEqual({ outcome: "kept" });
    expect(calls).toEqual(["getUser", "consume"]);
  });

  it("INV-K4 (실패경로): 로그인해 있는데 토큰이 없거나 꼴이 다르면 DB 에 묻지 않고 그 로그인 그대로", async () => {
    const { deps, calls } = fakes({ current: OTHER });
    expect(await linkSignIn(deps, { t: "short" })).toEqual({ outcome: "kept" });
    expect(calls).toEqual(["getUser"]);
  });

  it("INV-K4 (실패경로): 로그인해 있는데 토큰 쓰기가 DB 오류면 그 로그인 그대로", async () => {
    const { deps, calls } = fakes({ current: OTHER });
    deps.links.consume = async () => {
      throw new Error("db");
    };
    expect(await linkSignIn(deps, { t: newLoginLinkToken().token })).toEqual({ outcome: "kept" });
    expect(calls.some((c) => c.startsWith("signOut"))).toBe(false);
  });
});

describe("INV-K4 (실패경로): 토큰이 없거나 못 쓰면 로그인하지 않는다", () => {
  it("INV-K4 (S1b): DB 가 null(없음·이미 씀·만료)이면 실패 — 로그인 값을 만들지 않는다", async () => {
    const { deps, calls } = fakes({ consumed: null });
    expect(await linkSignIn(deps, { t: newLoginLinkToken().token })).toEqual({ outcome: "failed" });
    expect(calls).toEqual(["getUser", "consume"]);
  });

  it("INV-K4: 토큰이 없거나 꼴이 다르면 DB 에 묻지도 않는다(로그인 여부만 본다)", async () => {
    for (const body of [null, {}, { t: "" }, { t: "short" }, { t: 1 }]) {
      const { deps, calls } = fakes();
      expect(await linkSignIn(deps, body)).toEqual({ outcome: "failed" });
      expect(calls).toEqual(["getUser"]);
    }
  });

  it("INV-K4 (실패경로): 계정의 로그인 주소가 없으면 실패", async () => {
    const { deps, calls } = fakes({ email: null });
    expect((await linkSignIn(deps, { t: newLoginLinkToken().token })).outcome).toBe("failed");
    expect(calls.some((c) => c.startsWith("generateLink"))).toBe(false);
  });

  it("INV-K4 (실패경로): 확인이 실패하면 실패", async () => {
    const { deps } = fakes({ verifyError: true });
    expect((await linkSignIn(deps, { t: newLoginLinkToken().token })).outcome).toBe("failed");
  });

  it("INV-K4 · INV-L6 (실패경로): 운영에서 시험 계정 주소면 로그인 값을 만들지 않는다", async () => {
    const { deps, calls } = fakes({ email: "haru_creator@fankkuk.test", env: { NODE_ENV: "production" } });
    expect((await linkSignIn(deps, { t: newLoginLinkToken().token })).outcome).toBe("failed");
    expect(calls.some((c) => c.startsWith("generateLink"))).toBe(false);
  });
});

describe("INV-K5: 실패 로그에는 해시 앞 8자만", () => {
  it("INV-K5 (S3): 실패 로그에 토큰 원문·해시 전체가 없고 해시 앞 8자가 있다", async () => {
    const { token, hash } = newLoginLinkToken();
    const { deps, logs } = fakes({ consumed: null });
    await linkSignIn(deps, { t: token });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(hash.slice(0, 8));
    expect(logs[0]).not.toContain(token);
    expect(logs[0]).not.toContain(hash);
  });

  it("INV-K5: 기본 로그(console)도 같은 줄만 — 원문이 없다", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { token } = newLoginLinkToken();
    const { deps } = fakes({ consumed: null });
    delete (deps as { log?: unknown }).log;
    await linkSignIn(deps, { t: token });
    const printed = spy.mock.calls.flat().join(" ");
    expect(printed).not.toContain(token);
    expect(printed).toContain(loginLinkTokenHash(token).slice(0, 8));
  });
});
