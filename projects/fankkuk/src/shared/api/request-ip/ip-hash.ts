import { createHmac, randomBytes } from "node:crypto";
import { isProduction } from "@/shared/lib/env/is-production";

// 요청한 접속 주소(IP)를 원문 대신 비밀 값을 섞은 해시로 다룬다 — 횟수 한도처럼 「같은 주소인지」만 알면 되는 곳에 쓴다.
// 비밀 값은 서버 전용 환경 변수 FANKKUK_IP_HASH_SECRET(32자 이상). 공개 이름(NEXT_PUBLIC_)으로 설정돼 있으면 시작하지 않는다.
// 운영에서는 반드시 있어야 한다(없으면 시작하지 않는다). 로컬·시험에서는 없으면 실행마다 새로 만든 값을 쓴다 —
// 고정된 기본값을 두지 않아 그 값을 알고 해시를 되짚을 수 없다. 값은 오류 메시지에 넣지 않는다. 이름만.

type EnvLike = Record<string, string | undefined>;

const NAME = "FANKKUK_IP_HASH_SECRET";
const MIN_LENGTH = 32;

let localSecret: string | null = null;

export function readIpHashSecret(env: EnvLike): string {
  if (env[`NEXT_PUBLIC_${NAME}`] !== undefined) {
    throw new Error(`${NAME} 가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다`);
  }
  const value = env[NAME];
  if (value && value.length >= MIN_LENGTH) return value;
  if (isProduction(env)) throw new Error(`${NAME} 가 없거나 ${MIN_LENGTH}자보다 짧다`);
  localSecret ??= randomBytes(32).toString("hex");
  return localSecret;
}

/** 요청한 쪽의 접속 주소. 배포 환경(Vercel)이 채우는 x-real-ip, 없으면 x-forwarded-for 의 첫 값. 둘 다 없으면 "unknown". */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real;
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/** HMAC-SHA256 16진수 64자리. */
export function hashIp(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex");
}
