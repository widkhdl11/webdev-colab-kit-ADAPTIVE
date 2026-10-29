import { describe, expect, it } from "vitest";
import type { OutgoingMail } from "@/shared/api/mail/smtp";
import type { AlimtalkRequest, SolapiDelivery, SolapiPort } from "@/shared/api/solapi/solapi";
import { SolapiError } from "@/shared/api/solapi/solapi";
import { ChannelError, chooseNotificationChannels, OUTBOX_FIELD, solapiKakaoChannel } from "./channels";
import { TEST_SITE_ORIGINS } from "@/shared/lib/env/test-site";

// 알림 발송 통로 고르기 (notifications INV-N7·N10·N11). 고르는 곳은 이 함수 하나다.

function mailbox() {
  const sent: OutgoingMail[] = [];
  return { sent, sendMail: async (m: OutgoingMail) => void sent.push(m) };
}

const MESSAGE = { outboxId: "8d0c3a8e-1111-4222-8333-444455556666", to: "haru@example.com", subject: "[팬꾹] 제목", text: "본문", templateCode: null, variables: null };

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
      expect(() => chooseNotificationChannels(env, { sendMail: box.sendMail, hasKakaoTemplates: true })).toThrow(/SOLAPI_API_KEY/);
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

// 변수로 둔다 — 이 함수들의 설정 형식에는 시험 사이트 칸이 없고, 넘겨도 쓰지 않는다는 것이 시험의 요점이다
const testSiteEnv = { NODE_ENV: "production", FANKKUK_TEST_SITE: "1", APP_ORIGIN: TEST_SITE_ORIGINS[0] };

describe("INV-TS2: 시험 사이트에서도 알림 창구는 운영과 같다", () => {
  it("INV-TS2 (S2c, 실패경로): 시험 사이트라도 가짜 알림톡 창구가 나오지 않는다", () => {
    const ch = chooseNotificationChannels(testSiteEnv, { sendMail: async () => undefined, hasKakaoTemplates: false });
    expect(ch.kakao).toBeNull();
    expect(ch.email.fake).toBe(false);
  });
});

const SOLAPI_ENV = { NODE_ENV: "production", SOLAPI_API_KEY: "k", SOLAPI_API_SECRET: "s", SMS_SENDER_NUMBER: "0212345678", KAKAO_PF_ID: "PF1" };

function fakePort(opts: { sendFails?: boolean; found?: SolapiDelivery | null; lookupThrows?: boolean } = {}) {
  const sent: AlimtalkRequest[] = [];
  const finds: { field: string; value: string; since: Date }[] = [];
  const port: SolapiPort = {
    async sendAlimtalk(req) {
      sent.push(req);
      if (opts.sendFails) throw new SolapiError("alimtalk_send_failed");
      return "MSG1";
    },
    async sendSms() {
      throw new Error("알림은 문자를 쓰지 않는다");
    },
    async deliveryOf() {
      return "pending";
    },
    async findAlimtalkByField(field, value, since) {
      finds.push({ field, value, since });
      if (opts.lookupThrows) throw new SolapiError("lookup_incomplete");
      return opts.found === undefined ? null : opts.found;
    },
  };
  return { port, sent, finds };
}

describe("INV-N7: 운영의 카카오 통로는 솔라피 알림톡", () => {
  it("INV-N7·N11: 운영에서 솔라피 네 값이 있으면 진짜 알림톡 통로 — 템플릿 코드가 없어도(그 종류는 카카오 줄이 안 생길 뿐)", () => {
    const f = fakePort();
    for (const hasKakaoTemplates of [true, false]) {
      const ch = chooseNotificationChannels(SOLAPI_ENV, { sendMail: mailbox().sendMail, hasKakaoTemplates, solapiPort: () => f.port });
      expect(ch.kakao?.fake).toBe(false);
    }
  });

  it("INV-N11 (S11, 실패경로): 네 값 중 하나라도 없으면 템플릿이 있을 때 시작하지 않는다", () => {
    for (const missing of ["SOLAPI_API_KEY", "SOLAPI_API_SECRET", "SMS_SENDER_NUMBER", "KAKAO_PF_ID"]) {
      const env: Record<string, string> = { ...SOLAPI_ENV };
      delete env[missing];
      expect(() => chooseNotificationChannels(env, { sendMail: mailbox().sendMail, hasKakaoTemplates: true, solapiPort: () => fakePort().port })).toThrow();
    }
  });

  it("INV-N7: 템플릿 ID = 표의 template_code, 변수 그대로, 우리 발송 번호를 붙여 보낸다 — 대행사 메시지 ID 를 돌려준다", async () => {
    const f = fakePort();
    const ch = solapiKakaoChannel(f.port);
    const r = await ch.send({ ...MESSAGE, to: "01012345678", templateCode: "KA01TP1", variables: { "#{닉네임}": "하루", "#{주문번호}": "FC-1" } });
    expect(r).toEqual({ providerMessageId: "MSG1" });
    expect(f.sent).toEqual([{ to: "01012345678", templateId: "KA01TP1", variables: { "#{닉네임}": "하루", "#{주문번호}": "FC-1" }, customFields: { [OUTBOX_FIELD]: MESSAGE.outboxId } }]);
  });

  it("INV-N7 (실패경로): 템플릿 코드·변수가 없으면 보내지 않는다", async () => {
    const f = fakePort();
    const ch = solapiKakaoChannel(f.port);
    await expect(ch.send({ ...MESSAGE, to: "01012345678", templateCode: null, variables: {} })).rejects.toMatchObject({ code: "template_missing" });
    await expect(ch.send({ ...MESSAGE, to: "01012345678", templateCode: "T", variables: null })).rejects.toMatchObject({ code: "alimtalk_variables_missing" });
    expect(f.sent).toEqual([]);
  });

  it("INV-N10 (실패경로): 대행사 실패는 정해진 코드만(DB 의 코드 꼴)", async () => {
    const err = await solapiKakaoChannel(fakePort({ sendFails: true }).port)
      .send({ ...MESSAGE, to: "01012345678", templateCode: "T", variables: {} })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChannelError);
    expect((err as ChannelError).code).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
    expect((err as ChannelError).code).toBe("solapi_alimtalk_send_failed");
  });

  it("INV-N5: 멈춘 줄은 우리 발송 번호로 조회 — 도착이면 갔음, 실패·기록 없음이면 안 갔음, 결과 전·조회 실패면 던진다(건드리지 않음)", async () => {
    const at = Date.parse("2026-10-29T00:00:00Z");
    const delivered = fakePort({ found: "delivered" });
    expect(await solapiKakaoChannel(delivered.port, () => at).lookup!("o1")).toBe(true);
    expect(delivered.finds[0]).toMatchObject({ field: OUTBOX_FIELD, value: "o1" });
    expect(delivered.finds[0]!.since.getTime()).toBe(at - 48 * 3600 * 1000);
    expect(await solapiKakaoChannel(fakePort({ found: "failed" }).port).lookup!("o1")).toBe(false);
    expect(await solapiKakaoChannel(fakePort({ found: null }).port).lookup!("o1")).toBe(false);
    await expect(solapiKakaoChannel(fakePort({ found: "pending" }).port).lookup!("o1")).rejects.toBeInstanceOf(ChannelError);
    await expect(solapiKakaoChannel(fakePort({ lookupThrows: true }).port).lookup!("o1")).rejects.toBeInstanceOf(Error);
  });
});
