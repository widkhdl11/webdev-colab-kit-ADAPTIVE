import { describe, expect, it } from "vitest";
import type { ChannelLoginVerifier } from "@/shared/api/platform-channel/login-verifier";
import { HANDLE_NEEDED_MESSAGE, runVerificationAction, type VerificationActionDeps } from "./run-verification-action";

// 크리에이터의 채널 확인 처리 — 앱 서버 (creator-verification INV-V1·V2·V4·V14·V17·V20).

const ME = "11111111-2222-4333-8444-555555555555";
const APP = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

type Call = { who: "session" | "admin"; fn: string; args: unknown };
type Reply = { data?: unknown; error?: { code: string; message?: string } | null };

function setup(opts: {
  role?: "fan" | "creator" | "operator" | null;
  replies?: Record<string, Reply>;
  login?: boolean | { platform: string; channelKey: string } | null;
}) {
  const calls: Call[] = [];
  const client = (who: "session" | "admin") =>
    ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ who, fn, args });
        const r = opts.replies?.[fn] ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      },
    }) as never;
  const loginAsks: unknown[] = [];
  const loginVerifier: ChannelLoginVerifier = {
    kind: "fake",
    async ownedChannel(input) {
      loginAsks.push(input);
      if (opts.login === undefined || opts.login === true) return { platform: input.platform, channelKey: input.requestedChannelKey };
      if (opts.login === false) return null;
      return opts.login;
    },
  };
  const role = opts.role === undefined ? "creator" : opts.role;
  const deps: VerificationActionDeps = {
    session: client("session"),
    admin: client("admin"),
    viewer: role ? { userId: ME, role } : null,
    loginVerifier: opts.login === null ? null : loginVerifier,
  };
  return { deps, calls, loginAsks };
}

describe("누가 하는가 (INV-V1)", () => {
  it("INV-V1 (실패경로): 로그인하지 않으면 401, 팬·운영자는 403 — DB 를 부르지 않는다", async () => {
    for (const [role, status] of [
      [null, 401],
      ["fan", 403],
      ["operator", 403],
    ] as const) {
      const s = setup({ role });
      expect((await runVerificationAction(s.deps, { action: "request", channelUrl: "https://www.youtube.com/@ggul" })).status).toBe(status);
      expect((await runVerificationAction(s.deps, { action: "recheck_request" })).status).toBe(status);
      expect(s.calls).toEqual([]);
    }
  });

  it("INV-V1: 신청은 세션 클라이언트로 채널 주소 하나만 넘긴다 — 계정·아이디·코드·확인 방법 값은 받지 않는다", async () => {
    const s = setup({ replies: { request_creator_verification: { data: { application_id: APP } } } });
    const r = await runVerificationAction(s.deps, { action: "request", channelUrl: "https://m.youtube.com/@GgulDanji/videos?x=1" });
    expect(r.status).toBe(200);
    expect(s.calls).toEqual([{ who: "session", fn: "request_creator_verification", args: { p_channel_url: "https://www.youtube.com/@gguldanji" } }]);
    for (const extra of [{ accountId: ME }, { linkHandle: "haru" }, { code: "FK-7H3Q-92" }, { method: "login" }]) {
      const t = setup({});
      expect((await runVerificationAction(t.deps, { action: "request", channelUrl: "https://www.youtube.com/@ggul", ...extra })).status).toBe(400);
      expect(t.calls).toEqual([]);
    }
  });
});

describe("채널 주소 검사 (INV-V2)", () => {
  it("INV-V2 (실패경로): 받지 않는 플랫폼은 1:1 문의 안내, 꼴이 틀리면 꼴 안내 — DB 를 부르지 않는다", async () => {
    const s = setup({});
    const rplay = await runVerificationAction(s.deps, { action: "request", channelUrl: "https://rplay.live/play/abc" });
    expect(rplay).toMatchObject({ status: 400, body: { message: expect.stringContaining("1:1 문의") } });
    const http = await runVerificationAction(s.deps, { action: "request", channelUrl: "http://www.youtube.com/@ggul" });
    expect(http.status).toBe(400);
    expect(s.calls).toEqual([]);
  });

  it("INV-V2: DB 의 거부 문구는 정해진 화면 문구로 바꾼다 — 이미 확인중인 채널·횟수 다 씀", async () => {
    const busy = setup({ replies: { request_creator_verification: { error: { code: "FKV06" } } } });
    expect(await runVerificationAction(busy.deps, { action: "request", channelUrl: "https://www.youtube.com/@ggul" })).toEqual({
      status: 409,
      body: { message: "이미 확인 중인 채널입니다." },
    });
    const used = setup({ replies: { request_creator_verification: { error: { code: "FKV04" } } } });
    expect((await runVerificationAction(used.deps, { action: "request", channelUrl: "https://www.youtube.com/@ggul" })).body.message).toBe(
      "이 채널로는 더 요청할 수 없습니다. 1:1 문의를 이용해 주세요.",
    );
  });
});

describe("팬꾹 링크 확인 요청 (INV-V17)", () => {
  it("INV-V17 (실패경로): 링크용 아이디가 없으면 DB 의 거부(FKV17)를 「팬꾹 링크를 먼저 만들어 주세요」로", async () => {
    const s = setup({ replies: { request_creator_verification: { error: { code: "FKV17" } } } });
    expect(await runVerificationAction(s.deps, { action: "request", channelUrl: "https://www.youtube.com/@ggul" })).toEqual({
      status: 409,
      body: { message: HANDLE_NEEDED_MESSAGE },
    });
  });

  it("INV-V17 (실패경로): 코드 단계의 처리(다시 받기·코드 올렸어요·자동 확인)는 없다 — 400, DB 를 부르지 않는다", async () => {
    const s = setup({});
    for (const body of [{ action: "regenerate" }, { action: "post", applicationId: APP }, { action: "auto_check", applicationId: APP }]) {
      expect((await runVerificationAction(s.deps, body)).status).toBe(400);
    }
    expect(s.calls).toEqual([]);
  });

  it("INV-V4: 거두기는 세션 클라이언트로 요청 식별값만 넘긴다", async () => {
    const s = setup({});
    expect((await runVerificationAction(s.deps, { action: "withdraw", applicationId: APP })).status).toBe(200);
    expect(s.calls).toEqual([{ who: "session", fn: "withdraw_creator_verification", args: { p_application_id: APP } }]);
  });
});

describe("재확인 유예 중 다시 확인 요청 (INV-V20)", () => {
  it("INV-V20: 세션 클라이언트로 인자 없이 부른다 — 누구의 요청인지는 DB 가 토큰으로 정한다", async () => {
    const s = setup({});
    expect((await runVerificationAction(s.deps, { action: "recheck_request" })).status).toBe(200);
    expect(s.calls).toEqual([{ who: "session", fn: "request_creator_link_recheck", args: {} }]);
  });

  it("INV-V20 (실패경로): 유예 중이 아니면 409, 다른 크리에이터를 가리키는 값은 받지 않는다", async () => {
    const s = setup({ replies: { request_creator_link_recheck: { error: { code: "55000" } } } });
    expect((await runVerificationAction(s.deps, { action: "recheck_request" })).status).toBe(409);
    const t = setup({});
    expect((await runVerificationAction(t.deps, { action: "recheck_request", creatorId: APP })).status).toBe(400);
    expect(t.calls).toEqual([]);
  });
});

describe("플랫폼 로그인 확인 (INV-V14)", () => {
  it("INV-V14 (S14): 로그인 창구가 답한 채널로, 세션에서 확인한 계정을 관리자 키 함수에 넘긴다", async () => {
    const s = setup({});
    expect((await runVerificationAction(s.deps, { action: "login", channelUrl: "https://www.youtube.com/@GgulDanji" })).status).toBe(200);
    expect(s.loginAsks).toEqual([{ accountId: ME, platform: "youtube", requestedChannelKey: "gguldanji" }]);
    expect(s.calls).toEqual([
      { who: "admin", fn: "confirm_creator_channel_by_login", args: { p_account_id: ME, p_platform: "youtube", p_channel_key: "gguldanji" } },
    ]);
  });

  it("INV-V14: 창구가 다른 채널을 답하면 그 채널로 확인한다 — 브라우저가 적은 채널이 아니다", async () => {
    const s = setup({ login: { platform: "youtube", channelKey: "realowner" } });
    await runVerificationAction(s.deps, { action: "login", channelUrl: "https://www.youtube.com/@someoneelse" });
    expect(s.calls[0]?.args).toEqual({ p_account_id: ME, p_platform: "youtube", p_channel_key: "realowner" });
  });

  it("INV-V14 (실패경로): 창구가 주인이 아니라고 하면 DB 를 부르지 않는다", async () => {
    const s = setup({ login: false });
    expect((await runVerificationAction(s.deps, { action: "login", channelUrl: "https://www.youtube.com/@ggul" })).status).toBe(403);
    expect(s.calls).toEqual([]);
  });

  it("INV-V14 (실패경로): 운영(창구 없음)에서는 로그인 확인이 거부된다", async () => {
    const s = setup({ login: null });
    expect((await runVerificationAction(s.deps, { action: "login", channelUrl: "https://www.youtube.com/@ggul" })).status).toBe(503);
    expect(s.calls).toEqual([]);
  });

  it("INV-V14 (S14c, 실패경로): 다른 계정으로 확인된 채널이면 1:1 문의 안내", async () => {
    const s = setup({ replies: { confirm_creator_channel_by_login: { error: { code: "FKV05" } } } });
    expect((await runVerificationAction(s.deps, { action: "login", channelUrl: "https://www.youtube.com/@ggul" })).body.message).toBe(
      "이미 등록된 채널입니다. 1:1 문의를 이용해 주세요.",
    );
  });
});

describe("채널 없는 크리에이터 (signup INV-U21)", () => {
  it("INV-U21 (S21b, 실패경로): 확인 요청에 DB 가 채널이 없다고 하면(FKN01) 「채널을 먼저 만들어 주세요.」 409 — 500 이 아니다", async () => {
    const { deps } = setup({ replies: { request_creator_verification: { error: { code: "FKN01" } } } });
    expect(await runVerificationAction(deps, { action: "request", channelUrl: "https://www.youtube.com/@honeypot" })).toEqual({
      status: 409,
      body: { message: "채널을 먼저 만들어 주세요." },
    });
  });
});
