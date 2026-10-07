import { describe, expect, it } from "vitest";
import type { OutgoingMail } from "@/shared/api/mail/smtp";
import { signUp, type SignUpDeps } from "./sign-up";

// 시험용 비밀번호(실제 계정 아님). 비밀번호 칸에 긴 문자열을 바로 적으면 시크릿 검사에 걸려 상수로 둔다.
const TEST_PW = "long-enough-pw";
const NINE_CHARS = "123456789";
const SAME_AS_ID = "samepassword";

// DB 함수의 판정(잠금·유일·한 번만)은 통합 테스트(tests/integration/signup-db)가 본다.
// 여기서 보는 것은 앱 서버의 판정 — 무엇을 믿고, 무엇을 어떤 순서로 부르고, 실패하면 무엇을 되돌리나.

const VID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "99999999-0000-4000-8000-000000000001";

type RpcCall = { fn: string; args: Record<string, unknown> };

function harness(opts: {
  verifiedPhone?: string | null;
  createUserError?: { code: string } | null;
  createAccountError?: { code: string } | null;
  signInOk?: boolean;
  production?: boolean;
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const created: { email: string; password: string; email_confirm?: boolean }[] = [];
  const deleted: string[] = [];
  const signIns: { email: string; password: string }[] = [];
  const mails: OutgoingMail[] = [];
  const verifiedPhone = opts.verifiedPhone === undefined ? "01055556666" : opts.verifiedPhone;

  const deps: SignUpDeps = {
    env: opts.production ? { NODE_ENV: "production" } : { NODE_ENV: "development" },
    admin: {
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        if (fn === "usable_phone_verification") return { data: verifiedPhone, error: null };
        if (fn === "create_account" || fn === "create_creator_account") return { data: null, error: opts.createAccountError ?? null };
        if (fn === "issue_email_verification") {
          return { data: [{ token: "a".repeat(64), email: "new.fan@example.com", nickname: "newfan" }], error: null };
        }
        throw new Error(`모르는 함수 ${fn}`);
      },
      auth: {
        admin: {
          async createUser(a) {
            created.push(a);
            if (opts.createUserError) return { data: { user: null }, error: opts.createUserError };
            return { data: { user: { id: USER_ID } }, error: null };
          },
          async deleteUser(id) {
            deleted.push(id);
            return { error: null };
          },
        },
      },
    },
    auth: {
      async signInWithPassword(c) {
        signIns.push(c);
        return { error: opts.signInOk === false ? { code: "x" } : null };
      },
    },
    getMailer: () => ({
      appOrigin: "http://127.0.0.1:3311",
      send: async (m: OutgoingMail) => {
        mails.push(m);
      },
    }),
  };
  return { deps, rpcCalls, created, deleted, signIns, mails };
}

const body = (extra: Record<string, unknown> = {}) => ({
  role: "fan",
  loginId: "newfan",
  email: "new.fan@example.com",
  password: TEST_PW,
  phone: "010-5555-6666",
  terms: { service: true, privacy: true, news: false },
  verificationId: VID,
  ...extra,
});

describe("가입 — 정상 경로", () => {
  it("INV-U1 (S1)·U4·U8: 확인된 번호로 계정을 만들고, 가입 계정 주소로 로그인한다", async () => {
    const h = harness();
    const r = await signUp(h.deps, body());
    expect(r).toEqual({ ok: true, loggedIn: true, mailSent: true });
    expect(h.created).toEqual([{ email: "newfan@login.fankkuk.invalid", password: TEST_PW, email_confirm: true }]);
    const create = h.rpcCalls.find((c) => c.fn === "create_account");
    expect(create?.args).toEqual({
      p_user_id: USER_ID,
      p_login_id: "newfan",
      p_role: "fan",
      p_email: "new.fan@example.com",
      p_phone: "01055556666",
      p_verification_id: VID,
      p_terms: [
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: "2026-10-01" },
      ],
    });
    expect(h.signIns).toEqual([{ email: "newfan@login.fankkuk.invalid", password: TEST_PW }]);
    expect(h.deleted).toEqual([]);
  });

  it("INV-U7 (S7): 확인 메일은 가입 때 적은 주소로 한 통, 본문에 휴대폰 번호가 없다", async () => {
    const h = harness();
    await signUp(h.deps, body());
    expect(h.rpcCalls.filter((c) => c.fn === "issue_email_verification")).toEqual([
      { fn: "issue_email_verification", args: { p_account_id: USER_ID } },
    ]);
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]!.to).toBe("new.fan@example.com");
    expect(h.mails[0]!.text).toContain(`/me/email/confirm?token=${"a".repeat(64)}`);
    expect(h.mails[0]!.text).not.toMatch(/5555|6666|010/);
  });

  it("INV-U6: 선택 약관에 동의하면 그 기록도 남긴다 — 판 번호는 서버가 정한다", async () => {
    const h = harness();
    await signUp(h.deps, body({ terms: { service: true, privacy: true, news: true, version: "1999" } }));
    const create = h.rpcCalls.find((c) => c.fn === "create_account");
    expect(create?.args.p_terms).toEqual([
      { key: "service", version: "2026-10-01" },
      { key: "privacy", version: "2026-10-01" },
      { key: "news", version: "2026-10-01" },
    ]);
  });
});

describe("INV-U1: 계정은 서버가 확인한 번호로만", () => {
  it("INV-U1 (S1b, 실패경로): 확인된 번호와 입력 번호가 다르면 로그인 정보도 만들지 않는다", async () => {
    const h = harness({ verifiedPhone: "01055556666" });
    const r = await signUp(h.deps, body({ phone: "01099990000" }));
    expect(r).toMatchObject({ ok: false, status: 400, field: "verification" });
    expect(h.created).toEqual([]);
  });

  it("INV-U1 (S1c, 실패경로): 쓸 수 없는 번호표면 거부 — 본문의 「인증 완료」 표시는 보지 않는다", async () => {
    const h = harness({ verifiedPhone: null });
    const r = await signUp(h.deps, body({ verified: true, kakaoVerified: true }));
    expect(r).toMatchObject({ ok: false, status: 400, field: "verification" });
    expect(h.created).toEqual([]);
  });

  it("INV-U1 (실패경로): DB 가 마지막에 번호표를 거부하면(FKU01) 만든 로그인 정보를 지운다", async () => {
    const h = harness({ createAccountError: { code: "FKU01" } });
    const r = await signUp(h.deps, body());
    expect(r).toMatchObject({ ok: false, status: 400, field: "verification" });
    expect(h.deleted).toEqual([USER_ID]);
    expect(h.signIns).toEqual([]);
  });
});

describe("INV-U3·U11: 중복은 칸 단위로만 알려 준다", () => {
  it("INV-U3 (S3, 실패경로): 이미 가입된 번호(FKU02)면 그 문구, 로그인 정보는 지운다", async () => {
    const h = harness({ createAccountError: { code: "FKU02" } });
    const r = await signUp(h.deps, body());
    expect(r).toEqual({ ok: false, status: 409, field: "phone", message: "이미 가입된 휴대폰 번호예요. 로그인해 주세요." });
    expect(h.deleted).toEqual([USER_ID]);
  });

  it("INV-U3 (S3b, 실패경로): 같은 아이디(로그인 주소 중복 또는 FKU03)면 아이디 칸 문구", async () => {
    const taken = { ok: false, status: 409, field: "loginId", message: "이미 쓰는 아이디예요." };
    const a = harness({ createUserError: { code: "email_exists" } });
    expect(await signUp(a.deps, body())).toEqual(taken);
    expect(a.rpcCalls.some((c) => c.fn === "create_account")).toBe(false);
    const b = harness({ createAccountError: { code: "FKU03" } });
    expect(await signUp(b.deps, body())).toEqual(taken);
    expect(b.deleted).toEqual([USER_ID]);
  });

  it("INV-U3 (S3b, 동시): 같은 아이디가 동시에 만들어지는 중이면 Auth 가 코드 없는 오류를 준다 — 한 번 더 시도해 「쓰는 아이디」로 알린다", async () => {
    const h = harness();
    const answers = [{ code: undefined }, { code: "email_exists" }];
    h.deps.admin.auth.admin.createUser = async (a) => {
      h.created.push(a);
      return { data: { user: null }, error: answers.shift() ?? { code: "email_exists" } };
    };
    expect(await signUp(h.deps, body())).toEqual({ ok: false, status: 409, field: "loginId", message: "이미 쓰는 아이디예요." });
    expect(h.created).toHaveLength(2);
  });

  it("INV-U3 (실패경로): 다시 시도해도 다른 오류면 서버 오류로 올린다 — 세 번째는 하지 않는다", async () => {
    const h = harness();
    h.deps.admin.auth.admin.createUser = async (a) => {
      h.created.push(a);
      return { data: { user: null }, error: {} };
    };
    await expect(signUp(h.deps, body())).rejects.toThrow();
    expect(h.created).toHaveLength(2);
  });

  it("INV-U11 (S11, 실패경로): 본인 확인 전이면 번호가 가입됐는지와 상관없이 「본인 확인 필요」뿐", async () => {
    const h = harness({ verifiedPhone: null, createAccountError: { code: "FKU02" } });
    const r = await signUp(h.deps, body());
    expect(r).toMatchObject({ ok: false, status: 400, field: "verification" });
    expect(JSON.stringify(r)).not.toContain("이미 가입");
  });
});

describe("INV-U4: 한 번에 만들어진다", () => {
  it("INV-U4 (S4, 실패경로): DB 쪽이 예상 못 한 오류로 실패해도 로그인 정보를 지우고 오류를 올린다", async () => {
    const h = harness({ createAccountError: { code: "XX000" } });
    await expect(signUp(h.deps, body())).rejects.toThrow();
    expect(h.deleted).toEqual([USER_ID]);
  });
});

describe("INV-U4: 로그인 정보가 홀로 남지 않는다", () => {
  it("INV-U4 (실패경로): 계정 만들기 호출이 예외로 끝나도(네트워크 단절) 로그인 정보를 지운다", async () => {
    const h = harness();
    const rpc = h.deps.admin.rpc;
    h.deps.admin.rpc = async (fn, args) => {
      if (fn === "create_account") throw new Error("network down");
      return rpc(fn, args);
    };
    await expect(signUp(h.deps, body())).rejects.toThrow();
    expect(h.deleted).toEqual([USER_ID]);
  });

  it("INV-U4 (실패경로): 지우기가 한 번 실패하면 다시 지운다 — 그래도 실패하면 오류로 올린다", async () => {
    const once = harness({ createAccountError: { code: "FKU02" } });
    let failures = 1;
    once.deps.admin.auth.admin.deleteUser = async (id) => {
      once.deleted.push(id);
      return { error: failures-- > 0 ? { message: "temporary" } : null };
    };
    expect(await signUp(once.deps, body())).toMatchObject({ ok: false, field: "phone" });
    expect(once.deleted).toEqual([USER_ID, USER_ID]);

    const never = harness({ createAccountError: { code: "FKU02" } });
    never.deps.admin.auth.admin.deleteUser = async (id) => {
      never.deleted.push(id);
      return { error: { message: "down" } };
    };
    await expect(signUp(never.deps, body())).rejects.toThrow(/지우지 못했다/);
    expect(never.deleted).toEqual([USER_ID, USER_ID]);
  });

  it("INV-U3: 코드가 있는 오류(비밀번호 거부 등)는 다시 시도하지 않는다", async () => {
    const h = harness({ createUserError: { code: "weak_password" } });
    await expect(signUp(h.deps, body())).rejects.toThrow();
    expect(h.created).toHaveLength(1);
  });
});

describe("INV-U5·U6: 입력 경계", () => {
  it("INV-U5 (S5, 실패경로): 역할이 팬·크리에이터가 아니면 아무것도 부르지 않고 거부", async () => {
    for (const role of ["admin", "operator", "", null]) {
      const h = harness();
      expect(await signUp(h.deps, body({ role }))).toMatchObject({ ok: false, status: 400 });
      expect(h.rpcCalls).toEqual([]);
      expect(h.created).toEqual([]);
    }
  });

  it("INV-U5: 크리에이터 가입은 확인 안 된 공개 정보 행까지 만든다 — 역할 칸 없이 create_creator_account 가 크리에이터로 만든다(creator-verification INV-V1)", async () => {
    const h = harness();
    await signUp(h.deps, body({ role: "creator", creator: { name: "꿀단지", channelTitle: "꿀단지TV", tagIds: ["11111111-1111-4111-8111-000000000001"], customTag: "" } }));
    expect(h.rpcCalls.find((c) => c.fn === "create_account")).toBeUndefined();
    expect(h.rpcCalls.find((c) => c.fn === "create_creator_account")?.args).not.toHaveProperty("p_role");
  });

  it("INV-U6 (S6, 실패경로): 짧은 비밀번호·아이디와 같은 비밀번호·필수 약관 빠짐·꼴이 틀린 칸은 각각 거부", async () => {
    const bad = [
      body({ password: NINE_CHARS }),
      body({ password: "x".repeat(73) }),
      body({ loginId: SAME_AS_ID, password: SAME_AS_ID }),
      body({ terms: { service: true, privacy: false } }),
      body({ terms: { service: false, privacy: true } }),
      body({ loginId: "abc" }),
      body({ loginId: "x".repeat(21) }),
      body({ email: "a,b@example.com" }),
      body({ phone: "02-123-4567" }),
      body({ verificationId: "not-a-uuid" }),
    ];
    for (const b of bad) {
      const h = harness();
      const r = await signUp(h.deps, b);
      expect(r, JSON.stringify(b)).toMatchObject({ ok: false, status: 400 });
      expect(r.ok ? null : r.field, JSON.stringify(b)).not.toBe("form");
      expect(h.created).toEqual([]);
    }
  });

  it("INV-U6: 비밀번호 10자, 72자는 받는다", async () => {
    for (const password of ["x".repeat(10), "y".repeat(72)]) {
      expect((await signUp(harness().deps, body({ password }))).ok).toBe(true);
    }
  });
});

describe("INV-U9: 운영에서는 가입을 받지 않는다(카카오 연결 전)", () => {
  it("INV-U9 (S9, 실패경로): 운영 표시가 있으면 아무것도 부르지 않고 거부", async () => {
    const h = harness({ production: true });
    expect(await signUp(h.deps, body())).toMatchObject({ ok: false, status: 503 });
    expect(h.rpcCalls).toEqual([]);
    expect(h.created).toEqual([]);
  });
});

describe("가입 뒤", () => {
  it("로그인이 안 되면 계정은 그대로 두고 로그인 안내", async () => {
    const h = harness({ signInOk: false });
    expect(await signUp(h.deps, body())).toEqual({ ok: true, loggedIn: false, mailSent: true });
    expect(h.deleted).toEqual([]);
  });
});

describe("크리에이터 가입 — 공개 정보 행 (creator-verification INV-V1, signup INV-U5)", () => {
  const creator = { name: " 꿀단지 ", channelTitle: "꿀단지TV", tagIds: ["11111111-1111-4111-8111-000000000001", "11111111-1111-4111-8111-000000000002"], customTag: " 먹방 " };

  it("INV-V1 INV-T3: 크리에이터면 create_creator_account 로 계정과 공개 정보(이름·채널 이름·태그, 앞뒤 공백 뗌)를 한 번에 만든다", async () => {
    const h = harness();
    const r = await signUp(h.deps, body({ role: "creator", creator }));
    expect(r).toMatchObject({ ok: true });
    expect(h.rpcCalls.filter((c) => c.fn === "create_account")).toEqual([]);
    const call = h.rpcCalls.find((c) => c.fn === "create_creator_account");
    expect(call?.args).toEqual({
      p_user_id: USER_ID,
      p_login_id: "newfan",
      p_email: "new.fan@example.com",
      p_phone: "01055556666",
      p_verification_id: VID,
      p_terms: [
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: "2026-10-01" },
      ],
      p_name: "꿀단지",
      p_channel_title: "꿀단지TV",
      p_tag_ids: ["11111111-1111-4111-8111-000000000001", "11111111-1111-4111-8111-000000000002"],
      p_custom_tag: "먹방",
    });
  });

  it("INV-T3: 직접 입력이 없으면 빈 값이 아니라 null 로 넘긴다", async () => {
    const h = harness();
    await signUp(h.deps, body({ role: "creator", creator: { ...creator, customTag: "  " } }));
    expect(h.rpcCalls.find((c) => c.fn === "create_creator_account")?.args).toMatchObject({ p_tag_ids: ["11111111-1111-4111-8111-000000000001", "11111111-1111-4111-8111-000000000002"], p_custom_tag: null });
  });

  it("INV-V1: 팬이면 크리에이터 칸이 와도 create_account 를 부르고 공개 정보 칸을 넘기지 않는다", async () => {
    const h = harness();
    await signUp(h.deps, body({ role: "fan", creator }));
    expect(h.rpcCalls.filter((c) => c.fn === "create_creator_account")).toEqual([]);
    expect(h.rpcCalls.find((c) => c.fn === "create_account")?.args).toMatchObject({ p_role: "fan" });
    expect(h.rpcCalls.find((c) => c.fn === "create_account")?.args).not.toHaveProperty("p_name");
  });

  it("INV-V1 (실패경로): 크리에이터인데 공개 정보가 없거나 한도를 넘으면 그 칸으로 400 — 로그인 정보를 만들지 않는다", async () => {
    for (const [extra, field] of [
      [{}, "creatorName"],
      [{ creator: { ...creator, name: "  " } }, "creatorName"],
      [{ creator: { ...creator, name: "가".repeat(21) } }, "creatorName"],
      [{ creator: { ...creator, channelTitle: "가".repeat(41) } }, "channelTitle"],
      [{ creator: { ...creator, tagIds: [], customTag: "" } }, "tags"],
      [{ creator: { ...creator, customTag: "가".repeat(21) } }, "tags"],
      [{ creator: { ...creator, tagIds: ["not-a-uuid"] } }, "tags"],
    ] as const) {
      const h = harness();
      const r = await signUp(h.deps, body({ role: "creator", ...extra }));
      expect(r).toMatchObject({ ok: false, status: 400, field });
      expect(h.created).toEqual([]);
    }
  });

  it("INV-V1 INV-T3: 한도 끝 값(이름 20자·채널 이름 40자·직접 입력 20자 + 선택지 4개 = 태그 5개)은 받는다", async () => {
    const h = harness();
    const four = ["1", "2", "3", "4"].map((n) => `11111111-1111-4111-8111-00000000000${n}`);
    const r = await signUp(h.deps, body({ role: "creator", creator: { name: "가".repeat(20), channelTitle: "나".repeat(40), tagIds: four, customTag: "다".repeat(20) } }));
    expect(r).toMatchObject({ ok: true });
  });

  it("INV-V1 (실패경로): 공개 정보 만들기가 실패하면 방금 만든 로그인 정보를 지운다", async () => {
    const h = harness({ createAccountError: { code: "22023" } });
    const r = await signUp(h.deps, body({ role: "creator", creator }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(h.deleted).toEqual([USER_ID]);
  });
});
