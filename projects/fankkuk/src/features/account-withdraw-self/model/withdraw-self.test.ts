import { describe, expect, it, vi } from "vitest";
import type { DetachedAuth } from "@/entities/session/api/account-password";
import { PASSWORD_LOCKED_MESSAGE } from "@/entities/session/api/password-attempts";
import { fakePasswordAttempts } from "@/entities/session/api/password-attempts-fake";
import { CURRENT_PASSWORD_EMPTY, CURRENT_PASSWORD_WRONG } from "@/entities/session/model/password-rule";
import type { ViewerRole } from "@/entities/session/model/viewer";
import {
  FAN_OPEN_WORK_LINKS,
  MESSAGE_CREATOR_OPEN_WORK,
  MESSAGE_FAN_OPEN_WORK,
  MESSAGE_MEMBERS_ONLY,
  MESSAGE_SIGNATURE,
  SUPPORT_LINKS,
  withdrawSelf,
} from "./withdraw-self";

// my-account INV-A17 — 본인 탈퇴. 실제 DB 로 도는 시험(본인만·직원 거부·인자 없음·「본인 탈퇴」 기록)은
// tests/integration/account-withdrawal-db.integration.test.ts. 여기서는 서버가 하는 일을 붙든다:
// 계정은 세션의 사람뿐(본문의 계정 값은 받지 않는다), 비밀번호가 맞은 뒤에만 DB 를 부른다, 막히면 이유와 링크, 끝나면 사진 지우기·로그아웃.

const USER = "11111111-1111-4111-8111-111111111111";
const RESULT = { pseudonym: "p", fan_photo_paths: ["f/1.webp"], creator_photo_paths: [] as string[] };

type RpcError = { code: string; message?: string } | null;

function fakes(opts: { role?: ViewerRole | null; currentOk?: boolean; locked?: boolean; rpcError?: RpcError; rpcData?: unknown; photosOk?: boolean; grantFails?: boolean } = {}) {
  const limiter = fakePasswordAttempts({ locked: opts.locked });
  const calls: string[] = [];
  const rpcArgs: unknown[] = [];
  const detached: DetachedAuth = {
    async signInWithPassword() {
      calls.push("detached.signIn");
      return opts.currentOk === false ? { data: { user: null }, error: { message: "bad" } } : { data: { user: { id: USER } }, error: null };
    },
    async signOut(o) {
      calls.push(`detached.signOut:${o.scope}`);
      return { error: null };
    },
  };
  const role = opts.role === undefined ? "fan" : opts.role;
  const deps = {
    viewer: role === null ? null : { userId: USER, role },
    authAdmin: {
      async getUserById(uid: string) {
        return { data: { user: { id: uid, email: "it_me@login.fankkuk.invalid" } }, error: null };
      },
      async updateUserById() {
        return { error: null };
      },
    },
    makeDetachedAuth: () => detached,
    attempts: limiter.attempts,
    session: {
      async rpc(fn: string, ...args: unknown[]) {
        calls.push(`rpc:${fn}`);
        rpcArgs.push(...args);
        return { data: opts.rpcError ? null : (opts.rpcData ?? RESULT), error: opts.rpcError ?? null };
      },
    },
    grant: {
      async give(userId: string) {
        calls.push(`grant:${userId === USER ? "me" : userId}`);
        if (opts.grantFails) throw new Error("허가 표에 쓰지 못했다");
      },
      async drop(userId: string) {
        calls.push(`drop:${userId === USER ? "me" : userId}`);
      },
    },
    removePhotos: async (paths: { fan: string[]; creator: string[] }) => {
      calls.push(`photos:${paths.fan.length + paths.creator.length}`);
      return opts.photosOk ?? true;
    },
    endSession: async () => {
      calls.push("endSession");
    },
  };
  return { deps, limiter, calls, rpcArgs };
}

const body = { currentPassword: "right-pass-123" };

describe("INV-A17 S17: 본인 탈퇴 — 비밀번호 확인 → DB 본인 탈퇴 → 사진 지우기 → 로그아웃", () => {
  it("INV-A17 S17: 맞는 비밀번호면 확인 세션을 끝낸 뒤 withdraw_my_account 를 인자 없이 부르고, 사진을 지우고, 이 세션을 끝낸다", async () => {
    const { deps, calls, rpcArgs } = fakes();
    expect(await withdrawSelf(deps, body)).toEqual({ ok: true });
    expect(calls).toEqual(["detached.signIn", "detached.signOut:local", "grant:me", "rpc:withdraw_my_account", "photos:1", "endSession"]);
    expect(rpcArgs).toEqual([]);
  });

  it("INV-A17 S17: 지울 사진이 없으면 저장소를 부르지 않고 로그아웃만 한다", async () => {
    const { deps, calls } = fakes({ rpcData: { pseudonym: "p", fan_photo_paths: [], creator_photo_paths: [] } });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: true });
    expect(calls.slice(-2)).toEqual(["rpc:withdraw_my_account", "endSession"]);
  });

  it("INV-A17 (실패경로): 사진을 지우지 못해도 탈퇴는 끝났으니 로그아웃하고 성공으로 답한다 — 로그를 남긴다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, calls } = fakes({ photosOk: false });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: true });
    expect(calls).toContain("endSession");
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("INV-A17 (실패경로): DB 가 돌려준 값의 꼴이 틀려도 로그아웃하고 성공으로 답한다 — 로그를 남긴다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, calls } = fakes({ rpcData: "x" });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: true });
    expect(calls.at(-1)).toBe("endSession");
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("INV-A17 S17e: 계정은 세션의 사람뿐 — 본문의 계정 값은 받지 않는다, 팬·크리에이터만", () => {
  it("INV-A17 S17e (실패경로): 로그인하지 않았으면 401, 비밀번호 확인·DB 를 부르지 않는다", async () => {
    const { deps, calls } = fakes({ role: null });
    expect(await withdrawSelf(deps, body)).toMatchObject({ ok: false, status: 401 });
    expect(calls).toEqual([]);
  });

  it("INV-A17 S17e (실패경로): 직원·대표 계정(operator)은 403, 비밀번호 확인·DB 를 부르지 않는다", async () => {
    const { deps, calls } = fakes({ role: "operator" });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 403, message: MESSAGE_MEMBERS_ONLY });
    expect(calls).toEqual([]);
  });

  it("INV-A17 S17e (실패경로): 본문에 다른 사람 아이디·계정 ID 를 넣으면 400, 아무것도 부르지 않는다", async () => {
    for (const extra of [{ loginId: "haru_creator" }, { userId: "22222222-2222-4222-8222-222222222222" }]) {
      const { deps, calls } = fakes();
      expect(await withdrawSelf(deps, { ...body, ...extra })).toMatchObject({ ok: false, status: 400 });
      expect(calls).toEqual([]);
    }
  });

  it("INV-A17 (실패경로): 본문이 없거나 비밀번호가 글자가 아니면 400", async () => {
    for (const bad of [null, {}, { currentPassword: 1 }]) {
      const { deps, calls } = fakes();
      expect(await withdrawSelf(deps, bad)).toMatchObject({ ok: false, status: 400 });
      expect(calls).toEqual([]);
    }
  });

  it("INV-A17 (실패경로): DB 가 운영자라고 거부하면(42501) 403, 사진·로그아웃 없음", async () => {
    const { deps, calls } = fakes({ rpcError: { code: "42501" } });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 403, message: MESSAGE_MEMBERS_ONLY });
    expect(calls).not.toContain("endSession");
  });

  it("INV-A17 (실패경로): DB 가 계정을 찾지 못하면(P0002 — 이미 탈퇴) 401", async () => {
    const { deps, calls } = fakes({ rpcError: { code: "P0002" } });
    expect(await withdrawSelf(deps, body)).toMatchObject({ ok: false, status: 401 });
    expect(calls).not.toContain("endSession");
  });
});

describe("INV-A17 S17b: 지금 비밀번호가 맞을 때만 — 틀린 횟수는 아이디별 잠금(INV-L14)에 센다", () => {
  it("INV-A17 S17b (실패경로): 비밀번호가 비었으면 400·칸 표시, 확인·DB 를 부르지 않는다", async () => {
    const { deps, calls } = fakes();
    expect(await withdrawSelf(deps, { currentPassword: "" })).toEqual({ ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_EMPTY });
    expect(calls).toEqual([]);
  });

  it("INV-A17 S17b (실패경로): 틀린 비밀번호면 400, DB 를 부르지 않고 틀린 횟수를 적는다", async () => {
    const { deps, calls, limiter } = fakes({ currentOk: false });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 400, field: "currentPassword", message: CURRENT_PASSWORD_WRONG });
    expect(calls).toEqual(["detached.signIn"]);
    expect(limiter.calls).toEqual(["begin:it_me", "finish:1:false"]);
  });

  it("INV-A17 S17b (실패경로): 잠긴 아이디면 429, 맞는 비밀번호여도 확인하지 않고 DB 도 부르지 않는다", async () => {
    const { deps, calls } = fakes({ locked: true });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 429, field: "currentPassword", message: PASSWORD_LOCKED_MESSAGE });
    expect(calls).toEqual([]);
  });

  it("INV-A17 S17b: 맞는 비밀번호도 횟수 기록에 맞음으로 적는다", async () => {
    const { deps, limiter } = fakes();
    await withdrawSelf(deps, body);
    expect(limiter.calls).toEqual(["begin:it_me", "finish:1:true"]);
  });
});

describe("INV-A17 S17c·S17d: 거부 조건(INV-A15)에 걸리면 아무것도 지우지 않고 이유와 링크", () => {
  it("INV-A17 S17c (실패경로): 팬에게 진행 중인 일(55000)이면 409 — 보낸 선물·받은 선물 링크, 사진·로그아웃 없음", async () => {
    const { deps, calls } = fakes({ rpcError: { code: "55000" } });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 409, message: MESSAGE_FAN_OPEN_WORK, links: FAN_OPEN_WORK_LINKS });
    expect(FAN_OPEN_WORK_LINKS.map((l) => l.href)).toEqual(["/gifts", "/me/revgifts"]);
    expect(calls.some((c) => c.startsWith("photos") || c === "endSession")).toBe(false);
  });

  it("INV-A17 S17d (실패경로): 크리에이터에게 진행 중인 주문(55000)이면 409 — 1:1 문의 링크", async () => {
    const { deps, calls } = fakes({ role: "creator", rpcError: { code: "55000" } });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 409, message: MESSAGE_CREATOR_OPEN_WORK, links: SUPPORT_LINKS });
    expect(SUPPORT_LINKS.map((l) => l.href)).toEqual(["/support"]);
    expect(calls).not.toContain("endSession");
  });

  it("INV-A17 S17d (실패경로): 카카오 서명 기록(0A000)이면 409 — 1:1 문의 링크", async () => {
    const { deps, calls } = fakes({ role: "creator", rpcError: { code: "0A000" } });
    expect(await withdrawSelf(deps, body)).toEqual({ ok: false, status: 409, message: MESSAGE_SIGNATURE, links: SUPPORT_LINKS });
    expect(calls).not.toContain("endSession");
  });

  it("INV-A17 (실패경로): 그 밖의 DB 오류는 500, 사진·로그아웃 없음", async () => {
    const { deps, calls } = fakes({ rpcError: { code: "XX000" } });
    expect(await withdrawSelf(deps, body)).toMatchObject({ ok: false, status: 500 });
    expect(calls).not.toContain("endSession");
  });
});

describe("INV-A17 S17f: 일회용 허가 — 비밀번호가 맞은 뒤에만 남기고, 거부되면 거둔다", () => {
  it("INV-A17 S17f: 허가는 비밀번호 확인(확인 세션 끝내기까지) 뒤, DB 를 부르기 바로 전에 그 사람 앞으로 남긴다", async () => {
    const { deps, calls } = fakes();
    await withdrawSelf(deps, body);
    expect(calls.indexOf("grant:me")).toBe(calls.indexOf("detached.signOut:local") + 1);
    expect(calls.indexOf("rpc:withdraw_my_account")).toBe(calls.indexOf("grant:me") + 1);
    expect(calls).not.toContain("drop:me");
  });

  it("INV-A17 S17f (실패경로): 틀린 비밀번호·잠긴 아이디·빈 비밀번호·직원 계정에는 허가를 남기지 않는다", async () => {
    for (const [o, b] of [[{ currentOk: false }, body], [{ locked: true }, body], [{}, { currentPassword: "" }], [{ role: "operator" as const }, body]] as const) {
      const { deps, calls } = fakes(o);
      await withdrawSelf(deps, b);
      expect(calls.some((c) => c.startsWith("grant"))).toBe(false);
    }
  });

  it("INV-A17 S17f (실패경로): 허가를 남기지 못하면 DB 를 부르지 않고 예외(부르는 쪽 500)", async () => {
    const { deps, calls } = fakes({ grantFails: true });
    await expect(withdrawSelf(deps, body)).rejects.toThrow();
    expect(calls).not.toContain("rpc:withdraw_my_account");
  });

  it("INV-A17 S17f (실패경로): DB 가 거부하면(진행 중인 일 등 — 처리 전체가 되돌아가 허가가 남는다) 서버가 허가를 거둔다", async () => {
    for (const code of ["55000", "0A000", "XX000"]) {
      const { deps, calls } = fakes({ rpcError: { code } });
      await withdrawSelf(deps, body);
      expect(calls).toContain("drop:me");
    }
  });

  it("INV-A17 S17f (실패경로): DB 가 허가 없음(28000)으로 거부하면 409 일반 실패 문구, 링크 없음", async () => {
    const { deps, calls } = fakes({ rpcError: { code: "28000" } });
    const r = await withdrawSelf(deps, body);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r).not.toHaveProperty("links");
    expect(calls).not.toContain("endSession");
  });
});
