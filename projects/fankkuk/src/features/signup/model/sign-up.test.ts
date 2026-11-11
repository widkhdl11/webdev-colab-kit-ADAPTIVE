import { randomBytes } from "node:crypto";
import { decryptPhone, phoneHash, readPhoneKeys } from "@/shared/api/phone-crypto/phone-crypto";
import { describe, expect, it } from "vitest";
import type { OutgoingMail } from "@/shared/api/mail/smtp";
import { signUp, type SignUpDeps } from "./sign-up";
import { TERMS_VERSIONS } from "./signup-input";

// 시험용 비밀번호(실제 계정 아님). 비밀번호 칸에 긴 문자열을 바로 적으면 시크릿 검사에 걸려 상수로 둔다.
const TEST_PW = "long-enough-pw1";
const SEVEN_CHARS = "ab1!cd2";
const TWO_KINDS = "abcdefgh1";
const SAME_AS_ID = "same_pw_01";

// DB 함수의 판정(잠금·유일·한 번만)은 통합 테스트(tests/integration/signup-db)가 본다.
// 여기서 보는 것은 앱 서버의 판정 — 무엇을 믿고, 무엇을 어떤 순서로 부르고, 실패하면 무엇을 되돌리나.

const VID = "11111111-2222-4333-8444-555555555555";
const USER_ID = "99999999-0000-4000-8000-000000000001";

type RpcCall = { fn: string; args: Record<string, unknown> };

const KEY_ENV = { FANKKUK_PHONE_ENC_KEY: randomBytes(32).toString("base64"), FANKKUK_PHONE_HASH_KEY: randomBytes(32).toString("base64") };
const KEYS = readPhoneKeys(KEY_ENV);

function harness(opts: {
  verifiedPhone?: string | null;
  createUserError?: { code: string } | null;
  createAccountError?: { code: string } | null;
  signInOk?: boolean;
  production?: boolean;
  /** 가입 경로 기록이 실패한다(metrics INV-Q4) */
  recordFails?: boolean;
  /** 번호표의 확인 방법(signup INV-U19·U20) — 크리에이터 가입만 묻는다. 기본은 카카오 서명 */
  kind?: { data: unknown; error: { code: string } | null };
  /** 확인 메일 발급이 돌려주는 닉네임 — 채널을 만들기 전 크리에이터는 null(INV-U21) */
  mailNickname?: string | null;
} = {}) {
  const rpcCalls: RpcCall[] = [];
  const created: { email: string; password: string; email_confirm?: boolean }[] = [];
  const deleted: string[] = [];
  const signIns: { email: string; password: string }[] = [];
  const mails: OutgoingMail[] = [];
  const verifiedPhone = opts.verifiedPhone === undefined ? "01055556666" : opts.verifiedPhone;
  // signup INV-U18: DB 는 확인 줄의 번호 해시를 돌려준다
  const verifiedHash = typeof verifiedPhone === "string" ? phoneHash(KEYS, verifiedPhone) : verifiedPhone;

  const deps: SignUpDeps = {
    env: { ...(opts.production ? { NODE_ENV: "production" } : { NODE_ENV: "development" }), ...KEY_ENV },
    admin: {
      async rpc(fn: string, args: Record<string, unknown>) {
        rpcCalls.push({ fn, args });
        if (fn === "usable_phone_verification") return { data: verifiedHash, error: null };
        if (fn === "signup_verification_kind") return opts.kind ?? { data: "sign", error: null };
        if (fn === "discard_signup_sign") return { data: null, error: null };
        if (fn === "create_account" || fn === "create_creator_account") return { data: null, error: opts.createAccountError ?? null };
        if (fn === "record_signup_source") return { data: null, error: opts.recordFails ? { code: "XX000" } : null };
        if (fn === "issue_email_verification") {
          const nickname = opts.mailNickname === undefined ? "newfan" : opts.mailNickname;
          return { data: [{ token: "a".repeat(64), email: "new.fan@example.com", nickname }], error: null };
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
  nickname: " 새팬 ",
  email: "new.fan@example.com",
  password: TEST_PW,
  phone: "010-5555-6666",
  terms: { age14: true, service: true, privacy: true, news: false },
  verificationId: VID,
  ...extra,
});

/** 크리에이터 가입 본문 — 닉네임 칸이 없다(INV-U21) */
const creatorBody = (extra: Record<string, unknown> = {}) => {
  const { nickname: _nickname, ...rest } = body({ role: "creator", ...extra });
  return rest;
};

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
      p_phone: expect.any(String),
      p_verification_id: VID,
      p_terms: [
        { key: "age14", version: "2026-10-29" },
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: TERMS_VERSIONS.privacy },
      ],
      p_nickname: "새팬",
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
    await signUp(h.deps, body({ terms: { age14: true, service: true, privacy: true, news: true, version: "1999" } }));
    const create = h.rpcCalls.find((c) => c.fn === "create_account");
    expect(create?.args.p_terms).toEqual([
      { key: "age14", version: "2026-10-29" },
      { key: "service", version: "2026-10-01" },
      { key: "privacy", version: TERMS_VERSIONS.privacy },
      { key: "news", version: "2026-10-01" },
    ]);
  });
});

describe("INV-U16: 만 14세 이상 확인", () => {
  it("INV-U16 (S16, 실패경로): 「만 14세 이상입니다」 체크가 없으면 로그인 정보도 계정도 만들지 않는다", async () => {
    for (const terms of [{ service: true, privacy: true }, { age14: false, service: true, privacy: true }]) {
      const h = harness();
      expect(await signUp(h.deps, body({ terms }))).toMatchObject({ ok: false, status: 400, field: "terms", message: "만 14세 이상만 가입할 수 있습니다." });
      expect(h.created).toEqual([]);
      expect(h.rpcCalls.some((c) => c.fn === "create_account")).toBe(false);
    }
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
    expect(r).toEqual({ ok: false, status: 409, field: "phone", message: "이 번호로 가입된 계정이 있습니다." });
    expect(h.deleted).toEqual([USER_ID]);
  });

  it("INV-U3 (S3b, 실패경로): 같은 아이디(로그인 주소 중복 또는 FKU03)면 아이디 칸 문구", async () => {
    const taken = { ok: false, status: 409, field: "loginId", message: "이미 사용 중인 아이디입니다." };
    const a = harness({ createUserError: { code: "email_exists" } });
    expect(await signUp(a.deps, body())).toEqual(taken);
    expect(a.rpcCalls.some((c) => c.fn === "create_account")).toBe(false);
    const b = harness({ createAccountError: { code: "FKU03" } });
    expect(await signUp(b.deps, body())).toEqual(taken);
    expect(b.deleted).toEqual([USER_ID]);
  });

  it("INV-U6 (실패경로): 탈퇴 처리가 쓰는 아이디(withdrawn_ 로 시작)는 「쓰는 아이디」 — 로그인 정보를 만들지 않는다. 밑줄 없는 withdrawn 은 받는다", async () => {
    const taken = { ok: false, status: 409, field: "loginId", message: "이미 사용 중인 아이디입니다." };
    // 가명 아이디(withdrawn_ + 16자리)는 가입 한도 20자를 넘어 꼴에서 먼저 걸린다 — 20자 안의 꼴을 본다
    for (const loginId of ["withdrawn_shared", "withdrawn_0a1b2c"]) {
      const h = harness();
      expect(await signUp(h.deps, body({ loginId }))).toEqual(taken);
      expect(h.created).toEqual([]);
    }
    const ok = harness();
    expect((await signUp(ok.deps, body({ loginId: "withdrawnfan" }))).ok).toBe(true);
  });

  it("INV-U3 (S3b, 동시): 같은 아이디가 동시에 만들어지는 중이면 Auth 가 코드 없는 오류를 준다 — 한 번 더 시도해 「쓰는 아이디」로 알린다", async () => {
    const h = harness();
    const answers = [{ code: undefined }, { code: "email_exists" }];
    h.deps.admin.auth.admin.createUser = async (a) => {
      h.created.push(a);
      return { data: { user: null }, error: answers.shift() ?? { code: "email_exists" } };
    };
    expect(await signUp(h.deps, body())).toEqual({ ok: false, status: 409, field: "loginId", message: "이미 사용 중인 아이디입니다." });
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
    await signUp(h.deps, creatorBody());
    expect(h.rpcCalls.find((c) => c.fn === "create_account")).toBeUndefined();
    expect(h.rpcCalls.find((c) => c.fn === "create_creator_account")?.args).not.toHaveProperty("p_role");
  });

  it("INV-U6 (S6, 실패경로): 짧은 비밀번호·아이디와 같은 비밀번호·필수 약관 빠짐·꼴이 틀린 칸은 각각 거부", async () => {
    const bad = [
      body({ password: SEVEN_CHARS }),
      body({ password: TWO_KINDS }),
      body({ password: "x".repeat(73) }),
      body({ loginId: SAME_AS_ID, password: SAME_AS_ID }),
      body({ terms: { age14: true, service: true, privacy: false } }),
      body({ terms: { age14: true, service: false, privacy: true } }),
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

  it("INV-U6 (S6b): 세 종류를 섞은 8자, 72자 비밀번호는 받는다", async () => {
    for (const password of ["abc12!@#", `Aa1!${"y".repeat(68)}`]) {
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

describe("INV-U21: 크리에이터 가입은 닉네임·팬덤 이름·태그 없이 (채널은 마지막 단계에서)", () => {
  const profile = { tagIds: ["11111111-1111-4111-8111-000000000001"], customTag: "먹방", fanName: "꿀벌단" };

  it("INV-U21 (S21): 크리에이터면 create_creator_account 에 정해진 여섯 칸만 넘긴다 — 닉네임·팬덤 이름·태그는 없다", async () => {
    const h = harness();
    const r = await signUp(h.deps, creatorBody());
    expect(r).toMatchObject({ ok: true });
    expect(h.rpcCalls.filter((c) => c.fn === "create_account")).toEqual([]);
    expect(h.rpcCalls.find((c) => c.fn === "create_creator_account")?.args).toEqual({
      p_user_id: USER_ID,
      p_login_id: "newfan",
      p_email: "new.fan@example.com",
      p_phone: expect.any(String),
      p_verification_id: VID,
      p_terms: [
        { key: "age14", version: "2026-10-29" },
        { key: "service", version: "2026-10-01" },
        { key: "privacy", version: TERMS_VERSIONS.privacy },
      ],
    });
  });

  it("INV-U21 (실패경로): 본문에 태그·팬덤 이름·공개 이름이 와도 넘기지 않는다", async () => {
    const h = harness();
    const r = await signUp(h.deps, creatorBody({ creator: { ...profile, name: "다른이름", channelTitle: "다른채널" } }));
    expect(r).toMatchObject({ ok: true });
    const args = h.rpcCalls.find((c) => c.fn === "create_creator_account")?.args;
    expect(Object.keys(args ?? {}).sort()).toEqual(["p_email", "p_login_id", "p_phone", "p_terms", "p_user_id", "p_verification_id"]);
    expect(JSON.stringify(args)).not.toMatch(/다른|먹방|꿀벌단/);
  });

  it("INV-U21 (실패경로): 크리에이터에게 닉네임이 오면 닉네임 칸 400 — 로그인 정보를 만들지 않는다", async () => {
    const h = harness();
    expect(await signUp(h.deps, body({ role: "creator" }))).toMatchObject({ ok: false, status: 400, field: "nickname" });
    expect(h.created).toEqual([]);
    expect(h.rpcCalls).toEqual([]);
  });

  it("INV-V1: 팬이면 크리에이터 칸이 와도 create_account 를 부르고 공개 정보 칸을 넘기지 않는다", async () => {
    const h = harness();
    await signUp(h.deps, body({ role: "fan", creator: profile }));
    expect(h.rpcCalls.filter((c) => c.fn === "create_creator_account")).toEqual([]);
    expect(h.rpcCalls.find((c) => c.fn === "create_account")?.args).toMatchObject({ p_role: "fan" });
    expect(h.rpcCalls.find((c) => c.fn === "create_account")?.args).not.toHaveProperty("p_tag_ids");
  });

  it("INV-U21 (실패경로): 크리에이터 가입에서 DB 의 꼴 거부(22023)는 폼 오류 — 태그 칸이 아니다. 방금 만든 로그인 정보는 지운다", async () => {
    const h = harness({ createAccountError: { code: "22023" } });
    expect(await signUp(h.deps, creatorBody())).toEqual({ ok: false, status: 400, field: "form", message: "입력한 정보를 확인해 주세요." });
    expect(h.deleted).toEqual([USER_ID]);
  });

  it("INV-U21 (실패경로): 크리에이터 가입이 팬덤 이름·태그 필터 코드를 받아도 그 칸으로 보내지 않는다 — 모르는 오류로 올린다", async () => {
    for (const code of ["P0084", "P0082"]) {
      const h = harness({ createAccountError: { code } });
      await expect(signUp(h.deps, creatorBody())).rejects.toThrow();
      expect(h.deleted).toEqual([USER_ID]);
    }
  });

  it("INV-U21 INV-U7: 닉네임이 없는 크리에이터에게도 확인 메일이 간다 — 인사말에 빈 이름·null 이 없다", async () => {
    const h = harness({ mailNickname: null });
    expect(await signUp(h.deps, creatorBody())).toMatchObject({ ok: true, mailSent: true });
    expect(h.mails).toHaveLength(1);
    const first = h.mails[0]!.text.split(String.fromCharCode(10))[0]!;
    expect(first).not.toMatch(/null|undefined|^님/);
    expect(first).toContain("팬꾹에 가입해 주셔서 고마워요.");
  });

  it("INV-U7: 닉네임이 있으면 인사말에 그대로 쓴다", async () => {
    const h = harness({ mailNickname: "새팬" });
    await signUp(h.deps, body());
    expect(h.mails[0]!.text.split(String.fromCharCode(10))[0]).toBe("새팬님, 팬꾹에 가입해 주셔서 고마워요.");
  });
});

describe("INV-U13: 가입 닉네임", () => {

  it("INV-U13 (실패경로): 닉네임이 없거나 13자·공백뿐·보이지 않는 글자면 닉네임 칸으로 400, 로그인 정보를 만들지 않는다", async () => {
    for (const nickname of [undefined, "가".repeat(13), "   ", "하\u200b루"]) {
      const h = harness();
      const r = await signUp(h.deps, body({ nickname }));
      expect([nickname, r]).toMatchObject([nickname, { ok: false, status: 400, field: "nickname" }]);
      expect(h.created).toEqual([]);
    }
  });

  it("INV-U13: 12자 닉네임(이모지는 한 글자)은 받는다", async () => {
    const h = harness();
    expect((await signUp(h.deps, body({ nickname: "🌟".repeat(12) }))).ok).toBe(true);
    expect(h.rpcCalls.find((c) => c.fn === "create_account")?.args.p_nickname).toBe("🌟".repeat(12));
  });

  it("INV-U13 (실패경로): DB 가 같은 닉네임이 있다고 하면(FKU04) 닉네임 칸 「이미 쓰는 닉네임」 409, 방금 만든 로그인 정보는 지운다", async () => {
    const h = harness({ createAccountError: { code: "FKU04" } });
    expect(await signUp(h.deps, body())).toEqual({ ok: false, status: 409, field: "nickname", message: "이미 사용 중인 닉네임입니다." });
    expect(h.deleted).toEqual([USER_ID]);
  });

  it("INV-U13 (실패경로): 닉네임 필터(금칙어 FKU05·연락처 FKU06·기호만 FKU07)는 닉네임 칸에 사유 문구", async () => {
    for (const code of ["FKU05", "FKU06", "FKU07"]) {
      const h = harness({ createAccountError: { code } });
      const r = await signUp(h.deps, body());
      expect(r).toMatchObject({ ok: false, status: 400, field: "nickname" });
      expect(r.ok ? "" : r.message).toMatch(/닉네임/);
      expect(h.deleted).toEqual([USER_ID]);
    }
  });
});

describe("metrics INV-Q4: 가입 경로·utm 은 가입할 때 계정에 붙는다", () => {
  const UTM = { source: "x_share", medium: "social", campaign: null };

  it("INV-Q4: 고른 가입 경로와 쿠키의 utm 을 방금 만든 계정에 기록한다", async () => {
    const h = harness();
    const r = await signUp(h.deps, body({ heardFrom: "creator_stream" }), UTM);
    expect(r).toMatchObject({ ok: true });
    expect(h.rpcCalls.filter((c) => c.fn === "record_signup_source")).toEqual([
      {
        fn: "record_signup_source",
        args: { p_account_id: USER_ID, p_heard_from: "creator_stream", p_utm_source: "x_share", p_utm_medium: "social", p_utm_campaign: null },
      },
    ]);
  });

  it("INV-Q4 (S4): 가입 경로를 고르지 않아도 가입된다 — 빈 값으로 기록", async () => {
    const h = harness();
    const r = await signUp(h.deps, body(), null);
    expect(r).toEqual({ ok: true, loggedIn: true, mailSent: true });
    expect(h.rpcCalls.find((c) => c.fn === "record_signup_source")?.args).toEqual({
      p_account_id: USER_ID,
      p_heard_from: null,
      p_utm_source: null,
      p_utm_medium: null,
      p_utm_campaign: null,
    });
  });

  it("INV-Q4 (실패경로): 목록에 없는 가입 경로는 입력 경계에서 거부한다 — 계정을 만들지 않는다", async () => {
    const h = harness();
    const r = await signUp(h.deps, body({ heardFrom: "<script>" }));
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(h.created).toEqual([]);
  });

  it("INV-Q4 (실패경로): 기록이 실패해도 가입은 그대로 끝난다 — 답하기 싫은 사람·기록 오류가 가입을 막지 않는다", async () => {
    const h = harness({ recordFails: true });
    const r = await signUp(h.deps, body({ heardFrom: "x" }), UTM);
    expect(r).toEqual({ ok: true, loggedIn: true, mailSent: true });
    expect(h.deleted).toEqual([]);
  });

  it("INV-Q4 (실패경로): 계정 만들기가 실패하면 기록하지 않는다", async () => {
    const h = harness({ createAccountError: { code: "FKU02" } });
    await signUp(h.deps, body({ heardFrom: "x" }), UTM);
    expect(h.rpcCalls.some((c) => c.fn === "record_signup_source")).toBe(false);
  });
});

describe("INV-U18: 가입 번호는 묶음(해시·암호문·앞 3자리·뒤 4자리)으로만 DB 에", () => {
  it("INV-U18: 계정 만들기에 넘기는 번호는 그 계정에 묶인 암호문 묶음이고 숫자 번호가 없다", async () => {
    const h = harness();
    expect(await signUp(h.deps, body())).toMatchObject({ ok: true });
    const arg = h.rpcCalls.find((c) => c.fn === "create_account")?.args.p_phone;
    expect(typeof arg).toBe("string");
    expect(String(arg)).not.toContain("01055556666");
    const b = JSON.parse(String(arg)) as { hash: string; sealed: string; prefix: string; last4: string };
    expect(b.hash).toBe(phoneHash(KEYS, "01055556666"));
    expect(decryptPhone(KEYS, USER_ID, b.sealed)).toBe("01055556666");
    expect([b.prefix, b.last4]).toEqual(["010", "6666"]);
  });

  it("INV-U18 실패경로: 번호 키가 없으면 로그인 정보도 계정도 만들지 않는다", async () => {
    const h = harness();
    h.deps.env = { NODE_ENV: "development" };
    await expect(signUp(h.deps, body())).rejects.toThrow();
    expect(h.created).toEqual([]);
    expect(h.rpcCalls.filter((c) => c.fn === "create_account")).toEqual([]);
  });
});

describe("INV-U19·U20: 크리에이터 가입의 확인 방법", () => {

  it("INV-U19 (S19): 카카오 서명으로 확인된 번호표면 크리에이터 계정을 만든다 — 연결 기록은 같은 DB 처리가 만든다", async () => {
    const h = harness({ kind: { data: "sign", error: null } });
    expect(await signUp(h.deps, creatorBody())).toMatchObject({ ok: true });
    expect(h.rpcCalls.find((c) => c.fn === "signup_verification_kind")?.args).toEqual({ p_id: VID });
    expect(h.rpcCalls.some((c) => c.fn === "create_creator_account")).toBe(true);
  });

  it("INV-U20 (S20): 「창구 장애 확인」이 있는 인증번호 확인이면 크리에이터 계정을 만든다(연결은 나중)", async () => {
    const h = harness({ kind: { data: "code_down", error: null } });
    expect(await signUp(h.deps, creatorBody())).toMatchObject({ ok: true });
  });

  it("INV-U20 (S20b, 실패경로): 창구가 정상인데 인증번호로 확인한 번호표면 크리에이터 가입을 거부한다 — 로그인 정보도 만들지 않는다", async () => {
    const h = harness({ kind: { data: "code", error: null } });
    const r = await signUp(h.deps, creatorBody());
    expect(r).toMatchObject({ ok: false, status: 400, field: "verification" });
    expect(h.created).toEqual([]);
    expect(h.rpcCalls.some((c) => c.fn === "create_creator_account")).toBe(false);
  });

  it("INV-U19 (실패경로): 확인 방법을 읽는 DB 함수가 없으면(개인정보 구역 SQL 적용 전) 크리에이터 가입을 받지 않는다 — 팬 가입은 그대로", async () => {
    const h = harness({ kind: { data: null, error: { code: "PGRST202" } } });
    expect(await signUp(h.deps, creatorBody())).toMatchObject({ ok: false, status: 503, field: "form" });
    expect(h.created).toEqual([]);
    const fan = harness({ kind: { data: null, error: { code: "PGRST202" } } });
    expect(await signUp(fan.deps, body())).toMatchObject({ ok: true });
    expect(fan.rpcCalls.some((c) => c.fn === "signup_verification_kind")).toBe(false);
  });

  it("INV-U19 ⑤ 정함 (S19d): 서명 길에서 이미 가입된 번호(FKU02)면 그 요청의 봉투를 지우는 함수를 부른다", async () => {
    const h = harness({ kind: { data: "sign", error: null }, createAccountError: { code: "FKU02" } });
    expect(await signUp(h.deps, creatorBody())).toMatchObject({ ok: false, field: "phone" });
    expect(h.rpcCalls.find((c) => c.fn === "discard_signup_sign")?.args).toEqual({ p_verification_id: VID });
  });
});
