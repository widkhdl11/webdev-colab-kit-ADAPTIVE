import { describe, expect, it } from "vitest";
import type { OutgoingMail } from "@/shared/api/mail/smtp";
import { ChannelError, chooseNotificationChannels } from "./channels";

// 알림 발송 통로 고르기 (notifications INV-N7·N10·N11). 고르는 곳은 이 함수 하나다.

function mailbox() {
  const sent: OutgoingMail[] = [];
  return { sent, sendMail: async (m: OutgoingMail) => void sent.push(m) };
}

const MESSAGE = { outboxId: "8d0c3a8e-1111-4222-8333-444455556666", to: "haru@example.com", subject: "[팬꾹] 제목", text: "본문", templateCode: null };

describe("알림 발송 통로 고르기 (INV-N11)", () => {
  it("INV-N11: 로컬에서는 카카오 자리에 가짜 통로 — 메일 확인 화면으로 보내고 가짜로 표시한다", async () => {
    const box = mailbox();
    const ch = chooseNotificationChannels({ NODE_ENV: "development" }, { sendMail: box.sendMail, hasKakaoTemplates: true });
    expect(ch.kakao?.fake).toBe(true);
    // 운영이 아닌 서버의 메일도 가짜로 남는다 — 로컬 서버가 운영 DB 키로 떠 있어도 운영 DB 가 그 표시를 거부한다(INV-N11)
    expect(ch.email.fake).toBe(true);
    await ch.kakao!.send({ ...MESSAGE, to: "01012345678", templateCode: "TPL_ARRIVED_1" });
    expect(box.sent).toHaveLength(1);
    expect(box.sent[0]!.subject).toContain("카카오 알림톡 대신");
    expect(box.sent[0]!.to).not.toContain("01012345678"); // 번호를 메일 주소로 쓰지 않는다
  });

  it("INV-N11 (S11): 운영에서 템플릿 코드가 있는데 대행사 설정이 없으면 시작하지 않는다 — 설정 이름만 알린다", () => {
    const box = mailbox();
    for (const env of [{ NODE_ENV: "production" }, { VERCEL_ENV: "production" }]) {
      expect(() => chooseNotificationChannels(env, { sendMail: box.sendMail, hasKakaoTemplates: true })).toThrow(/KAKAO_ALIMTALK/);
    }
  });

  it("INV-N11: 운영에서 템플릿 코드가 없으면 카카오 통로가 없다 — 가짜로 넘어가지 않는다", () => {
    const ch = chooseNotificationChannels({ NODE_ENV: "production" }, { sendMail: mailbox().sendMail, hasKakaoTemplates: false });
    expect(ch.kakao).toBeNull();
    expect(ch.email.fake).toBe(false);
  });

  it("INV-N11 (실패경로): 운영에서 가짜를 켜는 설정은 없다 — 어떤 환경 값을 넣어도 운영의 카카오는 가짜가 아니다", () => {
    const env = { NODE_ENV: "production", FAKE_NOTIFICATIONS: "1", NOTIFICATION_FAKE: "true", KAKAO_FAKE: "1" };
    const ch = chooseNotificationChannels(env, { sendMail: mailbox().sendMail, hasKakaoTemplates: false });
    expect(ch.kakao).toBeNull();
  });

  it("INV-N3·N7: 메일 통로는 받은 주소 하나로 제목·본문 그대로 보낸다", async () => {
    const box = mailbox();
    const ch = chooseNotificationChannels({ NODE_ENV: "production" }, { sendMail: box.sendMail, hasKakaoTemplates: false });
    expect(await ch.email.send(MESSAGE)).toEqual({ providerMessageId: null });
    expect(box.sent).toEqual([{ to: "haru@example.com", subject: "[팬꾹] 제목", text: "본문" }]);
  });

  it("INV-N7: 템플릿 코드 없이 카카오로 보내려 하면 보내지 않고 오류 코드", async () => {
    const box = mailbox();
    const ch = chooseNotificationChannels({}, { sendMail: box.sendMail, hasKakaoTemplates: true });
    await expect(ch.kakao!.send({ ...MESSAGE, to: "01012345678" })).rejects.toMatchObject({ code: "template_missing" });
    expect(box.sent).toHaveLength(0);
  });

  it("INV-N10: 메일 서버 오류는 코드만 — 오류 문장(주소를 되풀이할 수 있다)은 넘기지 않는다", async () => {
    const ch = chooseNotificationChannels({}, {
      sendMail: async () => {
        throw new Error("550 mailbox haru@example.com unavailable");
      },
      hasKakaoTemplates: false,
    });
    const err = await ch.email.send(MESSAGE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChannelError);
    expect((err as ChannelError).code).toBe("smtp_error");
    expect(String((err as Error).message)).not.toContain("haru@example.com");
  });

  it("INV-N5: 메일은 발송 조회가 없고, 가짜 카카오는 조회하면 「안 갔다」로 답해 다시 보낸다", async () => {
    const ch = chooseNotificationChannels({}, { sendMail: mailbox().sendMail, hasKakaoTemplates: true });
    expect(ch.email.lookup).toBeNull();
    expect(await ch.kakao!.lookup!(MESSAGE.outboxId)).toBe(false);
  });
});
