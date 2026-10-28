// 환경 변수 → 설정. 서버가 뜰 때 한 번 읽고, 잘못된 값이면 뜨지 않는다.
//
// 외부 요청 허용 목록은 코드의 접미사 목록(드림시큐리티·카카오)이 상한이다.
// 환경 변수 OUTBOUND_ALLOWED_HOSTS 는 그 안에서 좁히기만 할 수 있고 넓힐 수 없다 —
// 목록 밖 도메인을 적으면 설정 오류로 서버가 뜨지 않는다.

export const ALLOWED_HOST_SUFFIXES = Object.freeze(["dreamsecurity.com", "kakao.com"]);

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

export function loadConfig(env = process.env) {
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
    dreamsecurity: Object.freeze({
      apiBaseUrl: optional(env, "DREAM_API_BASE_URL"),
      clientId: optional(env, "DREAM_CLIENT_ID"),
      clientSecret: optional(env, "DREAM_CLIENT_SECRET"),
    }),
    kakao: Object.freeze({
      clientId: optional(env, "KAKAO_CLIENT_ID"),
      clientSecret: optional(env, "KAKAO_CLIENT_SECRET"),
    }),
    kms: Object.freeze({
      region: optional(env, "AWS_REGION"),
      keyId: optional(env, "KMS_KEY_ID"),
      accessKeyId: optional(env, "AWS_ACCESS_KEY_ID"),
      secretAccessKey: optional(env, "AWS_SECRET_ACCESS_KEY"),
    }),
  });
}
