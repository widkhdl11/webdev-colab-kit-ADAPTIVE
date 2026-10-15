import { createHmac, randomBytes } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
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

/**
 * 횟수를 셀 단위. IPv4 는 주소 그대로, IPv6 는 앞 64비트 대역(/64) — 한 가입자 회선이 보통 /64 하나를 통째로 받아
 * 주소를 마음대로 바꿔 가며 한도를 피할 수 있기 때문이다(signup INV-U14). IPv4 를 담은 IPv6 꼴(::ffff:a.b.c.d)은 그 IPv4 로 본다.
 * 주소 꼴이 아니면(unknown 등) 받은 글자 그대로.
 */
export function rateKey(ip: string): string {
  const bare = ip.trim().replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (isIPv4(bare)) return bare;
  if (!isIPv6(bare)) return ip;
  const lower = bare.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped?.[1] && isIPv4(mapped[1])) return mapped[1];
  // 끝에 IPv4 꼴이 붙은 IPv6 는 그 32비트를 16진 묶음 둘로 바꿔 센다
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(lower);
  const hex = tail
    ? lower.slice(0, tail.index) + [0, 2].map((i) => ((Number(tail[i + 1]) << 8) | Number(tail[i + 2])).toString(16)).join(":")
    : lower;
  const [head = "", rest] = hex.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = rest === undefined || rest === "" ? [] : rest.split(":");
  const groups = rest === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}

/** HMAC-SHA256 16진수 64자리. 주소는 rateKey 로 센 단위를 해시한다(IPv6 는 /64). */
export function hashIp(secret: string, ip: string): string {
  return createHmac("sha256", secret).update(rateKey(ip)).digest("hex");
}
