import { describe, expect, it } from "vitest";
import { createSolapiPort, deliveryOf, readSolapiConfig, SolapiError, waitForDelivery } from "./solapi";

const CONFIG = { apiKey: "k", apiSecret: "s", senderNumber: "0212345678", pfId: "PF1" };

type Sent = { message: Record<string, unknown>; config: unknown };

function service(opts: { failed?: boolean; throws?: string; pages?: Record<string, { statusCode: string; customFields?: Record<string, string> }>[] } = {}) {
  const sent: Sent[] = [];
  const queries: Record<string, unknown>[] = [];
  const svc = {
    async send(message: unknown, config: unknown) {
      sent.push({ message: message as Record<string, unknown>, config });
      if (opts.throws) throw new Error(opts.throws);
      return {
        failedMessageList: opts.failed ? [{ to: "01055556666", statusMessage: "01055556666 번호 오류" }] : [],
        messageList: opts.failed ? [] : [{ messageId: "M1", statusCode: "2000", statusMessage: "ok" }],
      };
    },
    async getMessages(q: Record<string, unknown>) {
      queries.push(q);
      const pages = opts.pages ?? [];
      const i = queries.length - 1;
      return { messageList: pages[i] ?? {}, nextKey: i < pages.length - 1 ? `K${i + 1}` : null, limit: 200 };
    },
  };
  // 시험용 가짜 — SDK 의 응답 형식 중 이 파일이 읽는 칸만 채웠다
  return { svc: svc as never as Parameters<typeof createSolapiPort>[1], sent, queries };
}

describe("솔라피 설정 — 네 값", () => {
  it("INV-U9·N11: 키·비밀 키·발신번호·카카오 채널이 다 있어야 설정이다", () => {
    expect(readSolapiConfig({ SOLAPI_API_KEY: "k", SOLAPI_API_SECRET: "s", SMS_SENDER_NUMBER: "02-1234-5678", KAKAO_PF_ID: "PF1" })).toEqual(CONFIG);
    expect(readSolapiConfig({ SOLAPI_API_KEY: "k", SOLAPI_API_SECRET: "s", SMS_SENDER_NUMBER: "0212345678" })).toBeNull();
    expect(readSolapiConfig({ SMS_API_KEY: "k", SMS_API_SECRET: "s", SMS_SENDER_NUMBER: "0212345678", KAKAO_PF_ID: "PF1" })).toBeNull();
  });
});

describe("상태 코드", () => {
  it("2000·3000 은 결과 전, 4000 은 도착, 그 밖은 실패", () => {
    expect(deliveryOf("2000")).toBe("pending");
    expect(deliveryOf("3000")).toBe("pending");
    expect(deliveryOf(null)).toBe("pending");
    expect(deliveryOf("4000")).toBe("delivered");
    expect(deliveryOf("3104")).toBe("failed");
    expect(deliveryOf("1062")).toBe("failed");
  });
});

describe("INV-U15·N7: 알림톡은 대행사의 대체 문자를 끄고 보낸다", () => {
  it("알림톡 — type ATA, 발신번호·채널·템플릿·변수, disableSms: true, 메시지 ID 를 받는다", async () => {
    const s = service();
    const id = await createSolapiPort(CONFIG, s.svc).sendAlimtalk({ to: "01055556666", templateId: "T1", variables: { "#{인증번호}": "123456" }, customFields: { outboxId: "o1" } });
    expect(id).toBe("M1");
    expect(s.sent[0]!.message).toEqual({
      to: "01055556666",
      from: "0212345678",
      type: "ATA",
      kakaoOptions: { pfId: "PF1", templateId: "T1", variables: { "#{인증번호}": "123456" }, disableSms: true },
      customFields: { outboxId: "o1" },
    });
    expect(s.sent[0]!.config).toEqual({ showMessageList: true });
  });

  it("문자 — type SMS, 본문 그대로", async () => {
    const s = service();
    await createSolapiPort(CONFIG, s.svc).sendSms({ to: "01055556666", text: "본문" });
    expect(s.sent[0]!.message).toEqual({ to: "01055556666", from: "0212345678", type: "SMS", text: "본문" });
  });

  it("INV-U15·N10 (실패경로): 접수 실패·대행사 예외는 코드만 — 번호·대행사 문장이 오류에 없다", async () => {
    for (const s of [service({ failed: true }), service({ throws: "01055556666 은(는) 잘못된 번호" })]) {
      const err = await createSolapiPort(CONFIG, s.svc)
        .sendAlimtalk({ to: "01055556666", templateId: "T1", variables: {} })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SolapiError);
      expect(String((err as Error).message)).not.toContain("5555");
    }
  });
});

describe("결과 조회", () => {
  it("메시지 ID 로 묻는다", async () => {
    const s = service({ pages: [{ M1: { statusCode: "4000" } }] });
    expect(await createSolapiPort(CONFIG, s.svc).deliveryOf("M1")).toBe("delivered");
    expect(s.queries[0]).toEqual({ messageId: "M1" });
  });

  it("INV-N5: 우리 발송 번호(customFields)로 최근 알림톡을 쪽마다 찾는다 — 없으면 null", async () => {
    const s = service({ pages: [{ A: { statusCode: "4000", customFields: { outboxId: "x" } } }, { B: { statusCode: "3104", customFields: { outboxId: "o1" } } }] });
    const port = createSolapiPort(CONFIG, s.svc);
    expect(await port.findAlimtalkByField("outboxId", "o1", new Date(0))).toBe("failed");
    expect(s.queries[1]).toMatchObject({ type: "ATA", dateType: "CREATED", startKey: "K1" });
    expect(await createSolapiPort(CONFIG, service({ pages: [{}] }).svc).findAlimtalkByField("outboxId", "o1", new Date(0))).toBeNull();
  });

  it("INV-N5 (실패경로): 다섯 쪽을 넘겨도 못 찾으면 「모름」으로 던진다 — 안 간 것으로 보지 않는다", async () => {
    const pages = Array.from({ length: 6 }, () => ({}));
    await expect(createSolapiPort(CONFIG, service({ pages }).svc).findAlimtalkByField("outboxId", "o1", new Date(0))).rejects.toBeInstanceOf(SolapiError);
  });

  it("짧게 기다리기 — 조회 실패는 다음 차례에 다시 묻고, 시간이 다 되면 pending", async () => {
    let t = 0;
    const answers: (() => Promise<"pending" | "delivered">)[] = [async () => Promise.reject(new Error("x")), async () => "delivered"];
    const port = { deliveryOf: () => (answers.shift() ?? (async () => "pending" as const))() };
    expect(await waitForDelivery(port, "M1", { timeoutMs: 8000, intervalMs: 1000, now: () => t, sleep: async (ms) => void (t += ms) })).toBe("delivered");
    expect(await waitForDelivery({ deliveryOf: async () => "pending" }, "M1", { timeoutMs: 3000, intervalMs: 1000, now: () => t, sleep: async (ms) => void (t += ms) })).toBe("pending");
  });
});
