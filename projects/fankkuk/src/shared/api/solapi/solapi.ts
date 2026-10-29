import { SolapiMessageService } from "solapi";

// 솔라피(문자·카카오 알림톡 대행사) 연결 — 서버 전용. 가입 인증번호(signup INV-U15)와 알림 카카오 통로(notifications INV-N7)가 같이 쓴다.
// 이 파일은 대행사 호출만 감싼다 — 어느 템플릿으로 무엇을 보낼지는 부르는 쪽이 정한다.
// 받는 번호·본문·대행사 오류 문장은 로그·예외 메시지에 넣지 않는다(signup INV-U15, notifications INV-N10) — 실패는 정해진 코드로만 던진다.
//
// 근거(solapi 6.0.1 node_modules/solapi/dist/index.d.ts):
// - MessageService.send(messages, { showMessageList }) → DetailGroupMessageResponse. 모든 접수가 실패하면 MessageNotReceivedError 를 던지고,
//   접수 실패 건은 failedMessageList 에 온다. showMessageList: true 면 messageList[].messageId 가 온다.
// - MessageService.getMessages({ messageId } | { type, dateType, startDate, startKey, limit }) → GetMessagesResponse
//   (messageList: messageId 를 키로 한 기록, 기록마다 statusCode · customFields, 다음 쪽은 nextKey).
// - kakaoOptions: { pfId, templateId, variables, disableSms } — disableSms: true 면 대행사의 자동 대체 문자를 끈다.
// 상태 코드(솔라피 문서 「메시지 상태 코드」 https://solapi.com/developers/api/msgstatus · https://solapi.com/guides/message-status-codes):
//   2000 정상 접수 · 3000 이통사(카카오) 접수 완료 — 아직 결과 전 / 4000 수신 완료 — 도착 / 그 밖의 코드(1xxx·2xxx·3xxx 오류) — 실패.

type EnvLike = Record<string, string | undefined>;

/** 솔라피 공통 설정 — 키·비밀 키·발신번호·카카오 채널(pfId). 넷 다 있어야 설정된 것으로 본다. */
export type SolapiConfig = { apiKey: string; apiSecret: string; senderNumber: string; pfId: string };

export function readSolapiConfig(env: EnvLike): SolapiConfig | null {
  const apiKey = env.SOLAPI_API_KEY?.trim();
  const apiSecret = env.SOLAPI_API_SECRET?.trim();
  const senderNumber = env.SMS_SENDER_NUMBER?.replace(/[\s-]/g, "");
  const pfId = env.KAKAO_PF_ID?.trim();
  if (!apiKey || !apiSecret || !senderNumber || !pfId) return null;
  return { apiKey, apiSecret, senderNumber, pfId };
}

/** 대행사가 알려 준 한 메시지의 상태 */
export type SolapiDelivery = "delivered" | "pending" | "failed";

/** 대행사 호출 실패. code 는 기록에 남겨도 되는 값(소문자·숫자·밑줄)만. */
export class SolapiError extends Error {
  constructor(readonly code: string) {
    super(`솔라피 호출 실패: ${code}`);
    this.name = "SolapiError";
  }
}

const PENDING_CODES = new Set(["2000", "3000"]);
const DELIVERED_CODE = "4000";

export function deliveryOf(statusCode: string | null | undefined): SolapiDelivery {
  if (!statusCode || PENDING_CODES.has(statusCode)) return "pending";
  return statusCode === DELIVERED_CODE ? "delivered" : "failed";
}

export type AlimtalkRequest = { to: string; templateId: string; variables: Record<string, string>; customFields?: Record<string, string> };

/** 부르는 쪽이 쓰는 대행사 호출 — 시험에서는 가짜로 바꿔 끼운다. */
export type SolapiPort = {
  /** 알림톡 한 통을 접수한다(대체 문자 꺼짐). 접수된 메시지 ID 를 돌려준다. 접수 실패면 던진다. */
  sendAlimtalk(req: AlimtalkRequest): Promise<string>;
  /** 문자 한 통을 접수한다. 접수 실패면 던진다. */
  sendSms(req: { to: string; text: string }): Promise<string>;
  /** 메시지 ID 로 상태를 묻는다. */
  deliveryOf(messageId: string): Promise<SolapiDelivery>;
  /** 우리가 붙인 표시(customFields)로 최근 알림톡을 찾는다 — 없으면 null. 끝까지 훑지 못했으면 던진다. */
  findAlimtalkByField(field: string, value: string, since: Date): Promise<SolapiDelivery | null>;
};

type Service = Pick<SolapiMessageService, "send" | "getMessages">;

/** 한 번에 훑는 최근 알림톡 기록 쪽 수·쪽당 줄 수 — 넘으면 「모름」으로 던진다(안 간 것으로 보고 다시 보내지 않는다). */
const LOOKUP_PAGES = 5;
const LOOKUP_PAGE_SIZE = 200;

function acceptedId(res: Awaited<ReturnType<Service["send"]>>): string {
  if (res.failedMessageList.length > 0) throw new SolapiError("not_accepted");
  const id = res.messageList?.[0]?.messageId;
  if (!id) throw new SolapiError("no_message_id");
  return id;
}

export function createSolapiPort(config: SolapiConfig, service?: Service): SolapiPort {
  let svc = service ?? null;
  const client = (): Service => (svc ??= new SolapiMessageService(config.apiKey, config.apiSecret));
  const call = async <T>(code: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      // 대행사 오류 문장은 번호를 되풀이할 수 있다 — 코드만 넘긴다
      if (e instanceof SolapiError) throw e;
      throw new SolapiError(code);
    }
  };
  return {
    async sendAlimtalk({ to, templateId, variables, customFields }) {
      const res = await call("alimtalk_send_failed", () =>
        client().send(
          { to, from: config.senderNumber, type: "ATA", kakaoOptions: { pfId: config.pfId, templateId, variables, disableSms: true }, ...(customFields ? { customFields } : {}) },
          { showMessageList: true },
        ),
      );
      return acceptedId(res);
    },
    async sendSms({ to, text }) {
      const res = await call("sms_send_failed", () => client().send({ to, from: config.senderNumber, type: "SMS", text }, { showMessageList: true }));
      return acceptedId(res);
    },
    async deliveryOf(messageId) {
      const res = await call("lookup_failed", () => client().getMessages({ messageId }));
      const row = res.messageList[messageId] ?? Object.values(res.messageList)[0];
      return deliveryOf(row?.statusCode);
    },
    async findAlimtalkByField(field, value, since) {
      let startKey: string | undefined;
      for (let page = 0; page < LOOKUP_PAGES; page += 1) {
        const res = await call("lookup_failed", () =>
          client().getMessages({ type: "ATA", dateType: "CREATED", startDate: since, limit: LOOKUP_PAGE_SIZE, ...(startKey ? { startKey } : {}) }),
        );
        const hit = Object.values(res.messageList).find((m) => m.customFields?.[field] === value);
        if (hit) return deliveryOf(hit.statusCode);
        if (!res.nextKey) return null;
        startKey = res.nextKey;
      }
      throw new SolapiError("lookup_incomplete");
    },
  };
}

export type WaitOptions = { timeoutMs: number; intervalMs: number; sleep?: (ms: number) => Promise<void>; now?: () => number };

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 결과가 나올 때까지 짧게 기다린다 — 도착·실패가 나오면 그 값, 시간 안에 안 나오면 "pending".
 * 조회가 실패하면 그 차례는 건너뛰고 다시 묻는다(시간이 다 되면 "pending").
 */
export async function waitForDelivery(port: Pick<SolapiPort, "deliveryOf">, messageId: string, opts: WaitOptions): Promise<SolapiDelivery> {
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.timeoutMs;
  while (now() < deadline) {
    await sleep(Math.min(opts.intervalMs, Math.max(0, deadline - now())));
    try {
      const d = await port.deliveryOf(messageId);
      if (d !== "pending") return d;
    } catch {
      // 다음 차례에 다시
    }
  }
  return "pending";
}
