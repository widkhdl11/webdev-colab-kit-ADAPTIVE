import { createHmac, randomBytes, randomInt } from "node:crypto";
import { allowsFakeChannels, type TestSiteEnv } from "@/shared/lib/env/test-site";
import { isProduction } from "@/shared/lib/env/is-production";

// 휴대폰 번호 확인 — 서버가 만든 6자리 인증번호를 문자로 보낸다(signup INV-U1·U15).
// 문자 창구는 서버에서만 쓴다. 고르는 곳은 choosePhoneVerifier 하나다(INV-U9).
// 운영에서는 문자 대행사 연결이 생기기 전까지 창구가 없다 — 인증번호 요청과 가입이 모두 거부된다.
// 운영에서 가짜를 켜는 길은 시험 사이트 판정(test-site INV-TS1) 하나뿐이다 — 따로 켜는 설정은 두지 않는다.

/** 문자 한 통을 보내는 창구. 실패하면 예외를 던진다. */
export type PhoneVerifier = {
  kind: "fake" | "provider";
  send(phone: string, text: string): Promise<void>;
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

/** 문자 대행사 설정 — 대행사를 가리지 않는 이름. 셋 다 있어야 설정된 것으로 본다. */
export type SmsProviderConfig = { apiKey: string; apiSecret: string; senderNumber: string };

export function readSmsProviderConfig(env: EnvLike): SmsProviderConfig | null {
  const apiKey = env.SMS_API_KEY?.trim();
  const apiSecret = env.SMS_API_SECRET?.trim();
  const senderNumber = env.SMS_SENDER_NUMBER?.replace(/[\s-]/g, "");
  if (!apiKey || !apiSecret || !senderNumber) return null;
  return { apiKey, apiSecret, senderNumber };
}

/**
 * 가짜 창구 — 문자를 보내지 않는다. 로컬·시험 사이트 전용(INV-U9). 인증번호는 고정(FAKE_PHONE_CODE)이라 기록에 남기지 않는다 —
 * 서버 기록에는 번호 끝 4자리와 「보냄」만(본문·전체 번호는 남기지 않는다).
 */
const fakeVerifier: PhoneVerifier = {
  kind: "fake",
  fixedCode: FAKE_PHONE_CODE,
  async send(phone) {
    console.info(`[가짜 문자] 끝자리 ${phone.slice(-4)} 번호로 보냄`);
  },
};

export function choosePhoneVerifier(env: TestSiteEnv & EnvLike): PhoneVerifier | null {
  if (allowsFakeChannels(env)) return fakeVerifier;
  // 운영 — 대행사가 정해지면 readSmsProviderConfig(env) 로 그 어댑터를 만들어 여기서 돌려준다.
  // 그 전까지는 설정이 있어도 없어도 창구가 없다(가입 거부). 조용히 가짜로 넘어가지 않는다.
  return null;
}
