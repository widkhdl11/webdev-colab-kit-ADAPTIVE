import { describe, expect, it } from "vitest";
import type { ChannelBioReader, ChannelProfile } from "@/shared/api/platform-channel/bio-reader";
import type { ChannelLoginVerifier } from "@/shared/api/platform-channel/login-verifier";
import { runVerificationAction, type VerificationActionDeps } from "./run-verification-action";

// 크리에이터의 본인 확인 처리 — 앱 서버 (creator-verification INV-V1·V2·V4·V5·V14·V16).

const ME = "11111111-2222-4333-8444-555555555555";
const APP = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";
const CODE = "FK-7H3Q-92";

type Call = { who: "session" | "admin"; fn: string; args: unknown };
type Reply = { data?: unknown; error?: { code: string; message?: string } | null };

function setup(opts: {
  role?: "fan" | "creator" | "operator" | null;
  replies?: Record<string, Reply>;
  profile?: ChannelProfile | null;
  bio?: boolean;
  login?: boolean | { platform: string; channelKey: string } | null;
}) {
  const calls: Call[] = [];
  const order: string[] = [];
  const client = (who: "session" | "admin") =>
    ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ who, fn, args });
        order.push(fn);
        const r = opts.replies?.[fn] ?? {};
        return { data: r.data ?? null, error: r.error ?? null };
      },
    }) as never;
  const bioReads: unknown[] = [];
  const bioReader: ChannelBioReader = {
    kind: "fake",
    async readProfile(input) {
      bioReads.push(input);
      order.push("readProfile");
      return opts.profile === undefined ? { bio: `팬꾹 ${CODE}`, links: [], recentPosts: [] } : opts.profile;
    },
  };
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
    bioReader: opts.bio === false ? null : bioReader,
    loginVerifier: opts.login === null ? null : loginVerifier,
  };
  return { deps, calls, order, bioReads, loginAsks };
}

const CLAIMED = { data: { platform: "youtube", channel_key: "ggul", code: CODE } };

describe("누가 하는가 (INV-V1)", () => {
  it("INV-V1 (실패경로): 로그인하지 않으면 401, 팬·운영자는 403 — DB 를 부르지 않는다", async () => {
    for (const [role, status] of [
      [null, 401],
      ["fan", 403],
      ["operator", 403],
    ] as const) {
      const s = setup({ role });
      expect((await runVerificationAction(s.deps, { action: "request", channelUrl: "https://www.youtube.com/@ggul" })).status).toBe(status);
      expect((await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).status).toBe(status);
      expect(s.calls).toEqual([]);
    }
  });

  it("INV-V1: 신청은 세션 클라이언트로 채널 주소 하나만 넘긴다 — 계정·코드·확인 방법 값은 받지 않는다", async () => {
    const s = setup({ replies: { request_creator_verification: { data: { application_id: APP } } } });
    const r = await runVerificationAction(s.deps, { action: "request", channelUrl: "https://m.youtube.com/@GgulDanji/videos?x=1" });
    expect(r.status).toBe(200);
    expect(s.calls).toEqual([{ who: "session", fn: "request_creator_verification", args: { p_channel_url: "https://www.youtube.com/@gguldanji" } }]);
    for (const extra of [{ accountId: ME }, { code: CODE }, { method: "login" }]) {
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
      "채널 신청 횟수를 초과했습니다. 1:1 문의를 이용해 주세요.",
    );
  });
});

describe("다시 받기·확인 요청·거두기 (INV-V4·V5)", () => {
  it("INV-V4·V5: 세션 클라이언트로 신청 식별값만 넘긴다", async () => {
    const s = setup({});
    expect((await runVerificationAction(s.deps, { action: "regenerate" })).status).toBe(200);
    expect((await runVerificationAction(s.deps, { action: "post", applicationId: APP })).status).toBe(200);
    expect((await runVerificationAction(s.deps, { action: "withdraw", applicationId: APP })).status).toBe(200);
    expect(s.calls).toEqual([
      { who: "session", fn: "regenerate_creator_verification_code", args: {} },
      { who: "session", fn: "mark_creator_verification_posted", args: { p_application_id: APP } },
      { who: "session", fn: "withdraw_creator_verification", args: { p_application_id: APP } },
    ]);
  });

  it("INV-V5 (실패경로): 기한이 지난 신청의 확인 요청은 409 와 기한 안내", async () => {
    const s = setup({ replies: { mark_creator_verification_posted: { error: { code: "FKV08" } } } });
    expect(await runVerificationAction(s.deps, { action: "post", applicationId: APP })).toEqual({
      status: 409,
      body: { message: "확인 기한(7일)이 만료되었습니다. 다시 신청해 주세요." },
    });
  });
});

describe("코드 자동 확인 (INV-V16)", () => {
  it("INV-V16 (S16): 1분 제한을 먼저 잡고 → 소개란 창구로 그 채널을 읽고 → 찾았는지만 DB 에 넘긴다", async () => {
    const s = setup({ replies: { claim_creator_verification_auto_check: CLAIMED, confirm_creator_verification_auto_check: { data: "approved" } } });
    const r = await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP });
    expect(r).toEqual({ status: 200, body: { result: "approved" } });
    expect(s.order).toEqual(["claim_creator_verification_auto_check", "readProfile", "confirm_creator_verification_auto_check"]);
    expect(s.calls).toEqual([
      { who: "admin", fn: "claim_creator_verification_auto_check", args: { p_account_id: ME, p_application_id: APP } },
      { who: "admin", fn: "confirm_creator_verification_auto_check", args: { p_application_id: APP, p_found: true } },
    ]);
    // 읽을 채널은 DB 가 신청 줄에서 정한 것
    expect(s.bioReads).toEqual([{ platform: "youtube", channelKey: "ggul", codeForFake: CODE }]);
  });

  it("INV-V16 (S16b): 소개란에 코드가 없으면 「찾지 못함」을 넘기고 안내 문구를 돌려준다", async () => {
    const s = setup({
      profile: { bio: "안녕하세요", links: [], recentPosts: [] },
      replies: { claim_creator_verification_auto_check: CLAIMED, confirm_creator_verification_auto_check: { data: "not_found" } },
    });
    const r = await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP });
    expect(r).toEqual({ status: 200, body: { result: "not_found", message: "채널 소개란에서 인증 코드를 찾을 수 없습니다." } });
    expect(s.calls.at(-1)).toEqual({ who: "admin", fn: "confirm_creator_verification_auto_check", args: { p_application_id: APP, p_found: false } });
  });

  it("INV-V16 (실패경로): 소개란 칸만 읽는다 — 링크·최근 글에만 코드가 있으면 못 찾음", async () => {
    const s = setup({
      profile: { bio: "안녕하세요", links: [`https://x.example/${CODE}`], recentPosts: [`오늘 코드 ${CODE}`] },
      replies: { claim_creator_verification_auto_check: CLAIMED, confirm_creator_verification_auto_check: { data: "not_found" } },
    });
    await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP });
    expect(s.calls.at(-1)?.args).toEqual({ p_application_id: APP, p_found: false });
  });

  it("INV-V16 (S16d, 실패경로): 브라우저가 보낸 소개란 글·코드·채널은 받지 않는다", async () => {
    for (const extra of [{ bio: `팬꾹 ${CODE}` }, { code: CODE }, { channelKey: "other" }, { found: true }]) {
      const s = setup({});
      expect((await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP, ...extra })).status).toBe(400);
      expect(s.calls).toEqual([]);
    }
  });

  it("INV-V16 (S16e, 실패경로): 1분 제한에 걸리면 「잠시 뒤 다시 눌러 주세요」, 플랫폼 API 를 부르지 않는다", async () => {
    const s = setup({ replies: { claim_creator_verification_auto_check: { error: { code: "FKV15" } } } });
    expect(await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).toEqual({
      status: 429,
      body: { message: "잠시 후 다시 시도해 주세요." },
    });
    expect(s.bioReads).toEqual([]);
    expect(s.calls.map((c) => c.fn)).toEqual(["claim_creator_verification_auto_check"]);
  });

  it("INV-V10 (S10d, 실패경로): 위반 취소 뒤 자동 확인은 운영자 확인 안내, 플랫폼 API 를 부르지 않는다", async () => {
    const s = setup({ replies: { claim_creator_verification_auto_check: { error: { code: "FKV16" } } } });
    expect(await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).toEqual({
      status: 409,
      body: { message: "운영자 재확인이 필요합니다. 인증 코드를 받아 ‘확인 요청’을 눌러 주세요." },
    });
    expect(s.bioReads).toEqual([]);
  });

  it("INV-V16 (S16c, 실패경로): API 확인이 없는 플랫폼은 「확인 요청」 안내, 플랫폼 API 를 부르지 않는다", async () => {
    const s = setup({ replies: { claim_creator_verification_auto_check: { error: { code: "FKV14" } } } });
    expect((await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).body.message).toContain("확인 요청");
    expect(s.bioReads).toEqual([]);
  });

  it("INV-V16 (실패경로): 운영(창구 없음)에서는 자동 확인이 거부된다 — 1분 제한도 쓰지 않는다", async () => {
    const s = setup({ bio: false, replies: { claim_creator_verification_auto_check: CLAIMED } });
    expect((await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).status).toBe(503);
    expect(s.calls).toEqual([]);
  });

  it("INV-V16 (실패경로): 채널을 읽지 못하면 승인하지 않는다 — 찾았다고 넘기지 않음", async () => {
    const s = setup({ profile: null, replies: { claim_creator_verification_auto_check: CLAIMED } });
    expect((await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).status).toBe(502);
    expect(s.calls.map((c) => c.fn)).toEqual(["claim_creator_verification_auto_check"]);
  });

  it("INV-V16 (S16g): 다른 처리가 먼저 끝났으면 409 「이미 처리됐어요」", async () => {
    const s = setup({ replies: { claim_creator_verification_auto_check: CLAIMED, confirm_creator_verification_auto_check: { error: { code: "55000" } } } });
    expect((await runVerificationAction(s.deps, { action: "auto_check", applicationId: APP })).status).toBe(409);
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
