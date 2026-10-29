import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";
import type { SendMail } from "@/shared/api/mail/smtp";
import { createSolapiPort, readSolapiConfig, SolapiError, type SolapiPort } from "@/shared/api/solapi/solapi";

// 알림 발송 통로 (notifications INV-N7·N10·N11). 통로를 고르는 곳은 이 함수 하나다.
// 카카오 통로는 솔라피 알림톡이다(2026-10-29) — 운영에서 솔라피 네 값(SOLAPI_API_KEY·SOLAPI_API_SECRET·SMS_SENDER_NUMBER·KAKAO_PF_ID)이 있을 때만.
// 알림톡이 실패해도 문자로 대신 보내지 않는다(disableSms: true — INV-N7). 템플릿 ID 는 종류별 표의 template_code, 변수는 템플릿 문서 이름 그대로다.
// 로컬의 가짜는 알림톡 대신 같은 본문을 로컬 메일 확인 화면으로 보낸다. 운영에서 가짜를 켜는 설정은 일부러 두지 않는다
// (승인 서명 창구 approval-signer 와 같은 이유). 운영에서 카카오 템플릿 코드가 있는데 솔라피 설정이 없으면 시작하지 않는다.
// 오류는 코드만 넘긴다 — 메일 서버·대행사의 오류 문장은 주소·번호를 되풀이할 수 있다(INV-N10).

export type ChannelMessage = {
  /** 발송 대기 줄 id — 대행사에 우리 발송 번호로 넘겨 나중에 조회한다(INV-N5) */
  outboxId: string;
  /** 보내는 순간 읽은 연락처(휴대폰 번호 또는 확인된 이메일). 어디에도 남기지 않는다. */
  to: string;
  subject: string;
  text: string;
  /** 카카오만 — 그 종류의 승인된 템플릿 코드(INV-N7) */
  templateCode: string | null;
  /** 카카오만 — 알림톡 변수(템플릿 문서의 `#{이름}` 그대로, lib/alimtalk-body) */
  variables: Record<string, string> | null;
};

export type NotificationChannel = {
  fake: boolean;
  send(message: ChannelMessage): Promise<{ providerMessageId: string | null }>;
  /** 발송 조회 — 우리 발송 번호로 실제로 갔는지. 조회가 없는 통로(메일)는 null. */
  lookup: ((outboxId: string) => Promise<boolean>) | null;
};

export type NotificationChannels = { email: NotificationChannel; kakao: NotificationChannel | null };

/** 통로가 돌려준 실패. code 는 발송 기록에 남는 값이라 소문자·숫자·밑줄만(DB 제약과 같다). */
export class ChannelError extends Error {
  constructor(readonly code: string) {
    super(`알림 발송 실패: ${code}`);
    this.name = "ChannelError";
  }
}

/** 로컬 가짜 카카오가 보내는 메일 주소. 받는 사람 번호는 메일 주소로도, 본문으로도 쓰지 않는다. */
export const FAKE_KAKAO_INBOX = "kakao-fake@fankkuk.test";

// fake: 운영이 아닌 서버가 보낸 메일은 가짜로 기록한다 — 개발 기본값은 로컬 메일 확인 화면이라, 로컬 서버가 운영 DB 키로 떠 있으면
// 운영 줄이 실제로는 아무에게도 안 갔는데 「보냄」이 된다. 가짜 표시는 운영 DB 가 거부하므로 그 줄은 보냄이 되지 않는다(INV-N11).
function emailChannel(sendMail: SendMail, fake: boolean): NotificationChannel {
  return {
    fake,
    async send({ to, subject, text }) {
      try {
        await sendMail({ to, subject, text });
      } catch {
        throw new ChannelError("smtp_error");
      }
      return { providerMessageId: null };
    },
    lookup: null,
  };
}

function fakeKakaoChannel(sendMail: SendMail): NotificationChannel {
  return {
    fake: true,
    async send({ subject, text, templateCode }) {
      if (!templateCode) throw new ChannelError("template_missing");
      try {
        await sendMail({ to: FAKE_KAKAO_INBOX, subject: `[카카오 알림톡 대신 · ${templateCode}] ${subject}`, text });
      } catch {
        throw new ChannelError("fake_kakao_error");
      }
      return { providerMessageId: null };
    },
    // 가짜는 보낸 기록이 없다 — 멈춘 줄은 「안 갔다」로 보고 다시 보낸다(로컬에서 두 번 가도 해가 없다)
    lookup: async () => false,
  };
}

/** 발송 조회에서 거슬러 보는 시간 — 줄은 사건 뒤 24시간이면 실패로 끝나므로(INV-N5) 그보다 넉넉히 */
const LOOKUP_SINCE_MS = 48 * 60 * 60 * 1000;
/** 알림톡에 붙이는 우리 발송 번호의 이름(customFields) — 멈춘 줄을 이것으로 찾는다(INV-N5) */
export const OUTBOX_FIELD = "outboxId";

/** 솔라피 알림톡 통로. now 는 시험용 시계. */
export function solapiKakaoChannel(port: SolapiPort, now: () => number = Date.now): NotificationChannel {
  return {
    fake: false,
    async send({ outboxId, to, templateCode, variables }) {
      if (!templateCode) throw new ChannelError("template_missing");
      if (!variables) throw new ChannelError("alimtalk_variables_missing");
      try {
        const id = await port.sendAlimtalk({ to, templateId: templateCode, variables, customFields: { [OUTBOX_FIELD]: outboxId } });
        return { providerMessageId: id };
      } catch (e) {
        throw new ChannelError(e instanceof SolapiError ? `solapi_${e.code}`.slice(0, 40) : "solapi_error");
      }
    },
    // 우리 발송 번호로 찾는다(INV-N5): 도착 → 갔음 · 실패 → 안 갔음 · 기록 없음 → 안 갔음(접수 전에 끊겼다).
    // 아직 결과 전이거나 끝까지 훑지 못했으면 던진다 — 일꾼이 그 줄을 건드리지 않고 다음에 다시 본다(두 번 가지 않게)
    lookup: async (outboxId) => {
      const found = await port.findAlimtalkByField(OUTBOX_FIELD, outboxId, new Date(now() - LOOKUP_SINCE_MS));
      if (found === "pending") throw new ChannelError("lookup_pending");
      return found === "delivered";
    },
  };
}

export function chooseNotificationChannels(
  env: DeployEnv & Record<string, string | undefined>,
  deps: { sendMail: SendMail; hasKakaoTemplates: boolean; solapiPort?: (config: NonNullable<ReturnType<typeof readSolapiConfig>>) => SolapiPort },
): NotificationChannels {
  const email = emailChannel(deps.sendMail, !isProduction(env));
  if (isProduction(env)) {
    const config = readSolapiConfig(env);
    if (config) return { email, kakao: solapiKakaoChannel((deps.solapiPort ?? createSolapiPort)(config)) };
    if (deps.hasKakaoTemplates) throw new Error("카카오 템플릿 코드가 설정돼 있는데 솔라피 설정(SOLAPI_API_KEY·SOLAPI_API_SECRET·SMS_SENDER_NUMBER·KAKAO_PF_ID)이 없다");
    return { email, kakao: null };
  }
  return { email, kakao: fakeKakaoChannel(deps.sendMail) };
}
