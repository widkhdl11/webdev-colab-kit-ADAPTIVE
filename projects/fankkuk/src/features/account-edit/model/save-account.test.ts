import { describe, expect, it } from "vitest";
import type { OutgoingMail } from "@/shared/api/mail/smtp";
import { saveAccount } from "./save-account";

const FAN = { userId: "00000000-0000-4000-a000-000000000001", role: "fan" } as const;
const TOKEN = "f".repeat(64);
const VALID = { nickname: "별빛", email: "b@example.com", notifyKakao: true, notifyEmail: false };

type Reply = { data: unknown; error: { code: string } | null };

function fakeRpc(replies: Record<string, Reply>) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return replies[fn] ?? { data: null, error: { code: "XXXXX" } };
      },
    } as never,
  };
}

function setup(o: { update?: Reply; issue?: Reply; mailFails?: boolean } = {}) {
  const session = fakeRpc({ update_my_account: o.update ?? { data: true, error: null } });
  const admin = fakeRpc({
    issue_email_verification: o.issue ?? { data: [{ token: TOKEN, email: "b@example.com", nickname: "별빛" }], error: null },
  });
  const sent: OutgoingMail[] = [];
  let mailerReads = 0;
  const deps = {
    client: session.client,
    admin: admin.client,
    viewer: FAN as { userId: string; role: "fan" | "creator" | "operator" },
    getMailer: () => {
      mailerReads += 1;
      return {
        appOrigin: "http://127.0.0.1:3311",
        send: async (m: OutgoingMail) => {
          if (o.mailFails) throw new Error("smtp down");
          sent.push(m);
        },
      };
    },
  };
  return { session, admin, sent, deps, mailerReads: () => mailerReads };
}

describe("내 정보 저장", () => {
  it("INV-A3 S3b: 본문의 사람 ID·아이디·역할·번호는 DB 에 넘기지 않는다 — 네 칸만 넘긴다", async () => {
    const t = setup({ update: { data: false, error: null } });
    const r = await saveAccount(t.deps, {
      ...VALID,
      userId: "00000000-0000-4000-a000-000000000002",
      p_account_id: "x",
      loginId: "hacked",
      role: "creator",
      phone: "01099998888",
    });
    expect(r).toEqual({ ok: true, pendingEmail: null });
    expect(t.session.calls).toEqual([
      { fn: "update_my_account", args: { p_nickname: "별빛", p_email: "b@example.com", p_notify_kakao: true, p_notify_email: false } },
    ]);
    expect(t.admin.calls).toEqual([]);
  });

  it("INV-A3 S3c: 로그인하지 않았으면 401, DB 를 부르지 않는다", async () => {
    const t = setup();
    expect(await saveAccount({ ...t.deps, viewer: null }, VALID)).toMatchObject({ ok: false, status: 401 });
    expect(t.session.calls).toEqual([]);
  });

  it.each([
    ["닉네임 13자", { ...VALID, nickname: "가나다라마바사아자차카타파" }],
    ["공백뿐인 닉네임", { ...VALID, nickname: "   " }],
    ["이메일 abc", { ...VALID, email: "abc" }],
    ["255자 이메일", { ...VALID, email: `${"a".repeat(243)}@example.com` }],
    ["쉼표가 든 주소", { ...VALID, email: "a,b@example.com" }],
    ["꺾쇠가 든 주소", { ...VALID, email: "a<b>@example.com" }],
    ["알림이 글자", { ...VALID, notifyKakao: "true" }],
    ["칸 빠짐", { nickname: "별빛" }],
    ["본문 없음", null],
  ])("INV-A5 S5: %s 이면 400, DB 를 부르지 않는다", async (_label, body) => {
    const t = setup();
    expect(await saveAccount(t.deps, body)).toMatchObject({ ok: false, status: 400 });
    expect(t.session.calls).toEqual([]);
  });

  it("INV-A5: 12자 닉네임·이모지는 코드 포인트로 센다, 앞뒤 공백은 빼고 넘긴다", async () => {
    const t = setup({ update: { data: false, error: null } });
    await saveAccount(t.deps, { ...VALID, nickname: " 🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟🌟 ", email: " b@example.com " });
    expect(t.session.calls[0]!.args).toMatchObject({ p_nickname: "🌟".repeat(12), p_email: "b@example.com" });
  });

  it("INV-A5: DB 가 입력을 거부하면 400", async () => {
    const t = setup({ update: { data: null, error: { code: "22023" } } });
    expect(await saveAccount(t.deps, VALID)).toMatchObject({ ok: false, status: 400 });
  });

  it("INV-U13 (실패경로): DB 가 같은 닉네임이 있다고 하면(FKU04) 닉네임 칸 「이미 쓰는 닉네임」 409", async () => {
    const t = setup({ update: { data: null, error: { code: "FKU04" } } });
    expect(await saveAccount(t.deps, VALID)).toEqual({ ok: false, status: 409, field: "nickname", message: "이미 쓰는 닉네임이에요." });
    expect(t.admin.calls).toEqual([]);
  });

  it("INV-U13 (실패경로): 닉네임 필터(FKU05~07)는 닉네임 칸 400, 보이지 않는 글자는 DB 를 부르기 전에 닉네임 칸 400", async () => {
    for (const code of ["FKU05", "FKU06", "FKU07"]) {
      const t = setup({ update: { data: null, error: { code } } });
      expect(await saveAccount(t.deps, VALID)).toMatchObject({ ok: false, status: 400, field: "nickname" });
    }
    const t = setup();
    expect(await saveAccount(t.deps, { ...VALID, nickname: "별\u200b빛" })).toMatchObject({ ok: false, status: 400, field: "nickname" });
    expect(t.session.calls).toEqual([]);
  });

  it("INV-A7 S7: 이메일이 바뀌면 세션 ID 로 링크를 만들고 새 주소로 확인 메일 한 통을 보낸다", async () => {
    const t = setup();
    const r = await saveAccount(t.deps, VALID);
    expect(r).toEqual({ ok: true, pendingEmail: "b@example.com" });
    expect(t.admin.calls).toEqual([{ fn: "issue_email_verification", args: { p_account_id: FAN.userId } }]);
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.to).toBe("b@example.com");
    expect(t.sent[0]!.text).toContain(`http://127.0.0.1:3311/me/email/confirm?token=${TOKEN}`);
  });

  it("INV-A3 S3b: 본문에 다른 사람 ID 가 있어도 링크는 세션의 사람 것으로 만든다", async () => {
    const t = setup();
    await saveAccount(t.deps, { ...VALID, userId: "00000000-0000-4000-a000-000000000002", accountId: "00000000-0000-4000-a000-000000000002" });
    expect(t.admin.calls).toEqual([{ fn: "issue_email_verification", args: { p_account_id: FAN.userId } }]);
  });

  it("INV-A7: 링크 값은 응답에 들어가지 않는다", async () => {
    const t = setup();
    expect(JSON.stringify(await saveAccount(t.deps, VALID))).not.toContain(TOKEN);
  });

  it("INV-A7: 이메일이 그대로면 메일을 보내지 않고 메일 설정도 읽지 않는다", async () => {
    const t = setup({ update: { data: false, error: null } });
    await saveAccount(t.deps, VALID);
    expect(t.admin.calls).toEqual([]);
    expect(t.sent).toEqual([]);
    expect(t.mailerReads()).toBe(0);
  });

  it("크리에이터 계정은 403, DB 를 부르지 않는다(크리에이터 설정은 따로)", async () => {
    const t = setup();
    expect(await saveAccount({ ...t.deps, viewer: { userId: FAN.userId, role: "creator" } }, VALID)).toMatchObject({ ok: false, status: 403 });
    expect(t.session.calls).toEqual([]);
  });

  it("링크 발급 응답의 형식이 틀리면 메일을 보내지 않고 던진다", async () => {
    const t = setup({ issue: { data: [{ token: 1, email: "b@example.com", nickname: "별빛" }], error: null } });
    await expect(saveAccount(t.deps, VALID)).rejects.toThrow(/형식이 틀렸다/);
    expect(t.sent).toEqual([]);
  });

  it("INV-A8 S8: 저장 단계에서 한도에 걸리면 429, 메일을 보내지 않는다", async () => {
    const t = setup({ update: { data: null, error: { code: "FK429" } } });
    expect(await saveAccount(t.deps, VALID)).toMatchObject({ ok: false, status: 429 });
    expect(t.admin.calls).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it("INV-A8 S8: 링크 만들기에서 한도에 걸려도 429, 메일을 보내지 않는다", async () => {
    const t = setup({ issue: { data: null, error: { code: "FK429" } } });
    expect(await saveAccount(t.deps, VALID)).toMatchObject({ ok: false, status: 429 });
    expect(t.sent).toEqual([]);
  });

  it("메일 서버가 실패하면 502 로 알린다(다른 칸은 저장됐다고)", async () => {
    const t = setup({ mailFails: true });
    expect(await saveAccount(t.deps, VALID)).toMatchObject({ ok: false, status: 502 });
  });

  it("알 수 없는 DB 오류는 던진다", async () => {
    const t = setup({ update: { data: null, error: { code: "XX000" } } });
    await expect(saveAccount(t.deps, VALID)).rejects.toThrow(/XX000/);
  });
});
