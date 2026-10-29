import { createHmac, randomBytes, randomInt } from "node:crypto";
import { createSolapiPort, readSolapiConfig, waitForDelivery, type SolapiPort } from "@/shared/api/solapi/solapi";
import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";
import { isProduction } from "@/shared/lib/env/is-production";

// 휴대폰 번호 확인 — 서버가 만든 6자리 인증번호를 카카오 알림톡으로, 안 되면 문자로 보낸다(signup INV-U1·U15).
// 창구는 서버에서만 쓴다. 고르는 곳은 choosePhoneVerifier 하나다(INV-U9).
// 운영에서는 솔라피 다섯 값(키·비밀 키·발신번호·카카오 채널·인증번호 템플릿 ID)이 모두 있어야 창구가 있다 — 하나라도 없으면 인증번호 요청과 가입이 모두 거부된다.
// 운영에서 가짜를 켜는 길은 시험 사이트 판정(test-site INV-TS1) 하나뿐이다 — 따로 켜는 설정은 두지 않는다.
// 어느 길로 보낼지(알림톡 먼저 → 안 되면 문자, 문자는 한 번만 다시)는 부르는 쪽(features/signup 의 인증번호 요청)이 정한다.

/** 인증번호를 보내는 창구. */
export type PhoneVerifier = {
  kind: "fake" | "provider";
  /** 알림톡으로 인증번호를 보낸다. 도착이 확인되면 true, 실패했거나 잠깐 기다려도 확인되지 않으면 false. */
  sendKakaoCode(phone: string, code: string): Promise<boolean>;
  /** 문자 한 통. 접수에 실패하면 예외를 던진다. */
  sendSms(phone: string, text: string): Promise<void>;
  /**
   * 가짜 창구만 — 문자를 보내지 않으니 인증번호를 정해 둔다(로컬·시험 사이트에서 가입을 끝낼 수 있게).
   * 해시·만료·틀린 횟수·한도는 진짜와 같은 길을 지난다. 운영에는 가짜 창구가 없어 이 값이 쓰이는 경로가 없다.
   */
  fixedCode?: string;
};

/** 가짜 창구의 고정 인증번호 */
export const FAKE_PHONE_CODE = "000000";

const CODE_DIGITS = 6;

/** INV-U15: 안전한 난수로 만든 6자리 숫자(앞자리 0 포함). */
export function makePhoneCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, "0");
}

/**
 * INV-U15: DB 에는 이 해시만 넘긴다. 번호표(확인 한 건의 ID)를 같이 섞어, 같은 6자리라도 건마다 해시가 다르다.
 * HMAC-SHA256 16진수 64자리.
 */
export function hashPhoneCode(secret: string, verificationId: string, code: string): string {
  return createHmac("sha256", secret).update(`${verificationId}:${code}`).digest("hex");
}

type EnvLike = Record<string, string | undefined>;

const CODE_ENV_NAME = "PHONE_CODE_HASH_SECRET";
const MIN_SECRET_LENGTH = 32;

// 로컬·시험에서 비밀 값이 없을 때 쓰는 실행마다 새 값. 라우트 묶음이 따로 읽혀도 같은 값을 쓰도록 프로세스 전역에 둔다
// (요청 라우트가 만든 해시와 확인 라우트가 만든 해시가 같아야 한다).
const globalSecret = globalThis as { __fankkukPhoneCodeSecret?: string };

/**
 * 인증번호 해시용 비밀 값(서버 전용 환경 변수 PHONE_CODE_HASH_SECRET, 32자 이상). 접속 주소 해시의 비밀 값과 따로 둔다.
 * 운영에서는 반드시 있어야 한다. 로컬·시험에서는 없으면 실행마다 새로 만든 값을 쓴다. 값은 오류 메시지에 넣지 않는다.
 */
export function readPhoneCodeSecret(env: EnvLike): string {
  if (env[`NEXT_PUBLIC_${CODE_ENV_NAME}`] !== undefined) {
    throw new Error(`${CODE_ENV_NAME} 가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다`);
  }
  const value = env[CODE_ENV_NAME];
  if (value && value.length >= MIN_SECRET_LENGTH) return value;
  if (isProduction(env)) throw new Error(`${CODE_ENV_NAME} 가 없거나 ${MIN_SECRET_LENGTH}자보다 짧다`);
  globalSecret.__fankkukPhoneCodeSecret ??= randomBytes(32).toString("hex");
  return globalSecret.__fankkukPhoneCodeSecret;
}

/** 인증번호 알림톡 템플릿 ID — 솔라피 공통 네 값과 따로 받는다(docs/copy/alimtalk-templates.md 1절). */
const PHONE_CODE_TEMPLATE_ENV = "SOLAPI_PHONE_CODE_TEMPLATE_ID";

/** 알림톡 도착을 기다리는 시간·조회 간격(INV-U15 「잠깐 기다려도 도착이 확인되지 않으면」) */
export const KAKAO_WAIT_MS = 8_000;
const KAKAO_POLL_MS = 1_000;

/** 템플릿 문서의 변수 이름 그대로(docs/copy/alimtalk-templates.md 1절 `#{인증번호}`) */
export const PHONE_CODE_VARIABLE = "#{인증번호}";

/** 솔라피 창구 — 알림톡(대체 문자 꺼짐) → 결과 조회, 문자는 따로. 번호·인증번호·대행사 오류 문장은 기록하지 않는다. */
export function solapiVerifier(port: SolapiPort, templateId: string, wait: { timeoutMs: number; intervalMs: number; sleep?: (ms: number) => Promise<void>; now?: () => number } = { timeoutMs: KAKAO_WAIT_MS, intervalMs: KAKAO_POLL_MS }): PhoneVerifier {
  return {
    kind: "provider",
    async sendKakaoCode(phone, code) {
      try {
        const messageId = await port.sendAlimtalk({ to: phone, templateId, variables: { [PHONE_CODE_VARIABLE]: code } });
        return (await waitForDelivery(port, messageId, wait)) === "delivered";
      } catch {
        return false;
      }
    },
    async sendSms(phone, text) {
      await port.sendSms({ to: phone, text });
    },
  };
}

/**
 * 가짜 창구 — 알림톡도 문자도 보내지 않는다. 로컬·시험 사이트 전용(INV-U9). 인증번호는 고정(FAKE_PHONE_CODE)이라 기록에 남기지 않는다 —
 * 서버 기록에는 번호 끝 4자리와 「보냄」만(본문·전체 번호는 남기지 않는다). 알림톡이 도착한 것으로 답한다(화면은 「카카오톡으로」).
 */
const fakeVerifier: PhoneVerifier = {
  kind: "fake",
  fixedCode: FAKE_PHONE_CODE,
  async sendKakaoCode(phone) {
    console.info(`[가짜 알림톡] 끝자리 ${phone.slice(-4)} 번호로 보냄`);
    return true;
  },
  async sendSms(phone) {
    console.info(`[가짜 문자] 끝자리 ${phone.slice(-4)} 번호로 보냄`);
  },
};

export function choosePhoneVerifier(env: TestSiteEnv & EnvLike): PhoneVerifier | null {
  if (allowsFakeChannels(env)) return fakeVerifier;
  // 운영 — 다섯 값이 다 있을 때만 솔라피 창구. 하나라도 없으면 창구가 없다(가입 거부). 조용히 가짜로 넘어가지 않는다.
  const config = readSolapiConfig(env);
  const templateId = env[PHONE_CODE_TEMPLATE_ENV]?.trim();
  if (!config || !templateId) return null;
  return solapiVerifier(createSolapiPort(config), templateId);
}
