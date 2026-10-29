// 환경 변수 → 설정. 서버가 뜰 때 한 번 읽고, 잘못된 값이면 뜨지 않는다.
//
// 외부 요청 허용 목록은 코드의 접미사 목록(드림시큐리티·간편인증 중계 ez-iok.com·카카오)이 상한이다.
// 환경 변수 OUTBOUND_ALLOWED_HOSTS 는 그 안에서 좁히기만 할 수 있고 넓힐 수 없다 —
// 목록 밖 도메인을 적으면 설정 오류로 서버가 뜨지 않는다.

export const ALLOWED_HOST_SUFFIXES = Object.freeze(["dreamsecurity.com", "ez-iok.com", "kakao.com"]);

import path from "node:path";
import { fileURLToPath } from "node:url";

const GATEWAY_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** 연동 모듈 기본 위치 — 저장소에는 없다(README 「드림시큐리티 연동 모듈」) */
export const DEFAULT_DREAM_MODULE_FILE = path.join(GATEWAY_DIR, "lib", "vendor", "eziok_Key_Manager.cjs");
export const DREAM_ENVS = Object.freeze(["development", "production"]);
const TX_PREFIX_PATTERN = /^[A-Za-z0-9]{1,8}$/;
const SITE_URL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const ADAPTER_NAMES = Object.freeze(["dreamsecurity", "test"]);

const MIN_TOKEN_LENGTH = 32;
const PLACEHOLDER_PATTERN = /^__.*__$/;

export class ConfigError extends Error {}

function isPlaceholder(value) {
  return value === undefined || value === "" || PLACEHOLDER_PATTERN.test(value);
}

export function hostMatchesSuffix(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function parseAllowedHosts(raw) {
  if (isPlaceholder(raw)) return [];
  const hosts = raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  for (const host of hosts) {
    if (!ALLOWED_HOST_SUFFIXES.some((s) => hostMatchesSuffix(host, s))) {
      throw new ConfigError(
        `OUTBOUND_ALLOWED_HOSTS 의 ${host} 는 허용 범위(${ALLOWED_HOST_SUFFIXES.join(", ")}) 밖이다`,
      );
    }
  }
  return hosts;
}

function readToken(env, name, required) {
  const value = env[name];
  if (isPlaceholder(value)) {
    if (required) throw new ConfigError(`${name} 가 비어 있다`);
    return null;
  }
  if (value.length < MIN_TOKEN_LENGTH) {
    throw new ConfigError(`${name} 는 ${MIN_TOKEN_LENGTH}자 이상이어야 한다`);
  }
  return value;
}

/** 값이 비었거나 자리표시(__...__)면 null. 어댑터가 「아직 안 채움」을 판단하는 데 쓴다. */
function optional(env, name) {
  const value = env[name];
  return isPlaceholder(value) ? null : value;
}

// 송장 출력 함수의 DB 주소는 Supabase 프로젝트 주소 꼴(<20자 프로젝트 이름>.supabase.co) 하나만 받는다 — 허용 목록에 들어가는 값이다
const SUPABASE_URL_PATTERN = /^https:\/\/[a-z0-9]{20}\.supabase\.co\/?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 시험 사이트용 DB 주소. 여기 없는 DB 와는 시험 사이트 표시를 켤 수 없다. 비어 있으면 게이트웨이에서 가짜 서명은 열리지 않는다.
 *  enpghaykwlklnogcscpw — 2026-10-12 첫 배포 DB = 시험 사이트 DB(deploy-runbook: 실제 운영 DB 로 돌려쓰지 않는다).
 *  2026-10-28 사용자 지시(시험 사이트에서 게이트웨이·KMS 경유 송장 출력 확인)로 넣었다. 실제 운영 DB 는 여기 넣지 않는다. */
export const TEST_SITE_SUPABASE_HOSTS = Object.freeze(["enpghaykwlklnogcscpw.supabase.co"]);

function readInvoice(env, testSiteHosts) {
  const supabaseUrl = optional(env, "SUPABASE_URL");
  if (supabaseUrl && !SUPABASE_URL_PATTERN.test(supabaseUrl)) {
    throw new ConfigError("SUPABASE_URL 은 https://<프로젝트>.supabase.co 꼴이어야 한다");
  }
  const ownerUserId = optional(env, "DECRYPT_OWNER_USER_ID");
  if (ownerUserId && !UUID.test(ownerUserId)) throw new ConfigError("DECRYPT_OWNER_USER_ID 가 계정 ID 형식이 아니다");
  const testSite = optional(env, "FANKKUK_TEST_SITE");
  // 시험 사이트 표시는 가짜 서명을 재검증에서 받게 한다. 그 표시가 운영 DB 와 함께 남으면 DB 에 심은 가짜 서명 줄로
  // 승인 없는 주소가 열린다 — 그래서 DB 주소가 코드에 적힌 시험 프로젝트일 때만 켤 수 있다(설정 두 줄로는 못 켠다)
  if (testSite) {
    const host = supabaseUrl ? new URL(supabaseUrl).hostname : "";
    if (!testSiteHosts.includes(host)) {
      throw new ConfigError("FANKKUK_TEST_SITE 는 SUPABASE_URL 이 코드에 적힌 시험 프로젝트 주소일 때만 켤 수 있다");
    }
  }
  return Object.freeze({
    supabaseUrl: supabaseUrl ? supabaseUrl.replace(/\/$/, "") : null,
    supabaseKey: optional(env, "SUPABASE_PUBLISHABLE_KEY"),
    dbKey: optional(env, "DECRYPT_DB_KEY"),
    ownerUserId,
    testSite,
    appOrigin: optional(env, "APP_ORIGIN"),
  });
}

function readDreamsecurity(env) {
  const dreamEnv = optional(env, "DREAM_ENV");
  if (dreamEnv && !DREAM_ENVS.includes(dreamEnv)) throw new ConfigError(`DREAM_ENV 는 ${DREAM_ENVS.join(" | ")} 중 하나여야 한다`);
  const txPrefix = optional(env, "DREAM_TX_PREFIX") ?? "FANKKUK";
  if (!TX_PREFIX_PATTERN.test(txPrefix)) throw new ConfigError("DREAM_TX_PREFIX 는 영문·숫자 8자 이내여야 한다");
  const siteUrl = optional(env, "DREAM_SITE_URL");
  // 등록 도메인만(예 www.fankkuk.com) — https:// 나 경로를 붙이면 딜러사가 등록되지 않은 사이트로 거부한다
  if (siteUrl && !SITE_URL_PATTERN.test(siteUrl)) throw new ConfigError("DREAM_SITE_URL 은 https:// 없이 도메인만 적는다");
  const moduleFile = optional(env, "DREAM_MODULE_FILE");
  return Object.freeze({
    keyFile: optional(env, "DREAM_KEY_FILE"),
    keyPassword: optional(env, "DREAM_KEY_PASSWORD"),
    siteUrl,
    env: dreamEnv,
    caFile: optional(env, "DREAM_CA_FILE"),
    txPrefix,
    moduleFile: moduleFile ? path.resolve(GATEWAY_DIR, moduleFile) : DEFAULT_DREAM_MODULE_FILE,
  });
}

/** opts.testSiteHosts 는 시험에서만 바꿔 끼운다 */
export function loadConfig(env = process.env, { testSiteHosts = TEST_SITE_SUPABASE_HOSTS } = {}) {
  const adapter = env.SIGN_ADAPTER;
  if (!ADAPTER_NAMES.includes(adapter)) {
    throw new ConfigError(`SIGN_ADAPTER 는 ${ADAPTER_NAMES.join(" | ")} 중 하나여야 한다 (지금: ${adapter ?? "없음"})`);
  }

  const port = Number(env.LISTEN_PORT ?? "443");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError("LISTEN_PORT 가 올바른 포트 번호가 아니다");
  }

  return Object.freeze({
    adapter,
    port,
    host: env.LISTEN_HOST ?? "0.0.0.0",
    tlsCertFile: optional(env, "TLS_CERT_FILE"),
    tlsKeyFile: optional(env, "TLS_KEY_FILE"),
    // 토큰 교체 중에는 둘 다 받는다. Vercel 쪽을 새 값으로 바꾼 뒤 옛 값을 지운다.
    tokens: [readToken(env, "GATEWAY_TOKEN", true), readToken(env, "GATEWAY_TOKEN_NEXT", false)].filter(Boolean),
    allowedHosts: parseAllowedHosts(env.OUTBOUND_ALLOWED_HOSTS),
    dreamsecurity: readDreamsecurity(env),
    kakao: Object.freeze({
      clientId: optional(env, "KAKAO_CLIENT_ID"),
      clientSecret: optional(env, "KAKAO_CLIENT_SECRET"),
    }),
    invoice: readInvoice(env, testSiteHosts),
    kms: Object.freeze({
      region: optional(env, "AWS_REGION"),
      keyId: optional(env, "KMS_KEY_ID"),
      accessKeyId: optional(env, "AWS_ACCESS_KEY_ID"),
      secretAccessKey: optional(env, "AWS_SECRET_ACCESS_KEY"),
    }),
  });
}
