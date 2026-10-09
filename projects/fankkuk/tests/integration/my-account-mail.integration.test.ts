import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { saveAccount } from "@/features/account-edit/model/save-account";
import { createSmtpSender } from "@/shared/api/mail/smtp";
import { adminClient, psql, SEED, signedInClient } from "./helpers";
import { PHONE_IN_TEXT } from "./pii-shape";

// 내 정보 저장 → 확인 메일 → 링크 확인을 실제 DB·실제 메일 서버(로컬 Mailpit)로 한 바퀴 돈다.
// 메일 확인 화면 API: http://127.0.0.1:55324 (config.toml [local_smtp]). 보내는 포트 55325.

const MAILPIT = "http://127.0.0.1:55324";
const BYEOL_EMAIL = "byeolbit.fan@example.com";
const FAN = { userId: SEED.fanId, role: "fan" } as const;

type MailSummary = { ID: string; Subject: string };

async function mailsTo(address: string): Promise<MailSummary[]> {
  const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
  return ((await res.json()) as { messages: MailSummary[] }).messages;
}

async function mailText(id: string): Promise<string> {
  const res = await fetch(`${MAILPIT}/api/v1/message/${id}`);
  return ((await res.json()) as { Text: string }).Text;
}

function reset(): void {
  psql(`
    update public.profiles set nickname = '별빛' where id = '${SEED.fanId}';
    update pii.account_contacts set email = '${BYEOL_EMAIL}', pending_email = null, notify_kakao = true, notify_email = true where account_id = '${SEED.fanId}';
    delete from pii.email_verifications where account_id = '${SEED.fanId}';
  `);
}

beforeEach(reset);
afterAll(reset);

describe("INV-A7: 이메일을 바꾸면 새 주소로 확인 메일이 가고, 링크를 눌러야 바뀐다", () => {
  it("INV-A7 S7·S7b: 저장 → 새 주소 메일함에 링크 한 통 → 링크 확인 뒤에만 확인된 이메일이 바뀐다", async () => {
    const to = `byeol.${Date.now()}@example.com`;
    const fan = await signedInClient("byeolbit_fan");
    const r = await saveAccount(
      {
        client: fan,
        admin: adminClient(),
        viewer: FAN,
        getMailer: () => ({
          send: createSmtpSender({ host: "127.0.0.1", port: 55325, from: "팬꾹 <no-reply@fankkuk.test>" }),
          appOrigin: "http://127.0.0.1:3311",
        }),
      },
      { nickname: "별빛", email: to, notifyKakao: true, notifyEmail: true },
    );
    expect(r).toEqual({ ok: true, pendingEmail: to });

    const mails = await mailsTo(to);
    expect(mails).toHaveLength(1);
    const text = await mailText(mails[0]!.ID);
    const token = /\/me\/email\/confirm\?token=([0-9a-f]{64})/.exec(text)?.[1];
    expect(token).toBeDefined();

    // INV-A8 S8b: 메일 본문에 번호·주소 꼴이 없다
    expect(text).not.toMatch(PHONE_IN_TEXT);

    // 링크를 누르기 전에는 원래 주소 그대로
    const before = await fan.rpc("my_account");
    expect((before.data as { email: string }[])[0]!.email).toBe(BYEOL_EMAIL);

    const confirmed = await fan.rpc("confirm_my_email", { p_token: token });
    expect(confirmed.error).toBeNull();
    const after = await fan.rpc("my_account");
    expect((after.data as { email: string; pending_email: string | null }[])[0]).toMatchObject({ email: to, pending_email: null });
  });
});
