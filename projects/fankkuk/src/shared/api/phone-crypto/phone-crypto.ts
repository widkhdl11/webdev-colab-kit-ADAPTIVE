import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

// 휴대폰 번호 암호화·같은 번호 찾기 해시(signup INV-U18). 서버에서만 부른다.
// - 암호문: AES-256-GCM, 줄마다 새 12바이트 난수, 계정 ID 를 함께 묶는다(AAD) — 다른 계정 줄에 옮겨 붙이면 풀리지 않는다.
//   꼴: "v1.<난수 base64url>.<암호문+인증 꼬리표 base64url>". 앞의 v1 은 나중에 키를 바꿀 때 어느 키로 잠갔는지 가린다.
// - 해시: HMAC-SHA256(해시 키, "fankkuk.phone.v1:" + 번호) — 키 없이는 010 번호 전체를 대입해도 같은 값을 못 만든다.
// - 두 키는 서버 전용 환경 변수(base64, 32바이트)에만 있다. 접속 주소 해시와 달리 로컬에서도 없으면 실패한다 —
//   실행마다 새 키를 쓰면 다시 켰을 때 저장된 번호를 못 열고 중복 확인도 깨진다. 키 값은 오류 메시지에 넣지 않는다. 이름만.

type EnvLike = Record<string, string | undefined>;

export type PhoneKeys = { readonly encKey: Buffer; readonly hashKey: Buffer };

const ENC_NAME = "FANKKUK_PHONE_ENC_KEY";
const HASH_NAME = "FANKKUK_PHONE_HASH_KEY";
const VERSION = "v1";
const PHONE = /^01[016789][0-9]{7,8}$/;

function readKey(env: EnvLike, name: string): Buffer {
  if (env[`NEXT_PUBLIC_${name}`] !== undefined) {
    throw new Error(`${name} 가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다`);
  }
  const raw = env[name];
  if (!raw) throw new Error(`${name} 가 없다 — 번호를 저장·발송할 수 없다`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} 는 base64 로 쓴 32바이트여야 한다`);
  return key;
}

/** 두 키를 읽는다. 없거나·길이가 틀리거나·두 키가 같거나·공개 이름이면 실패한다. */
export function readPhoneKeys(env: EnvLike): PhoneKeys {
  const encKey = readKey(env, ENC_NAME);
  const hashKey = readKey(env, HASH_NAME);
  if (encKey.equals(hashKey)) throw new Error(`${ENC_NAME} 와 ${HASH_NAME} 는 서로 다른 값이어야 한다`);
  return { encKey, hashKey };
}

function assertPhone(phone: string): void {
  if (!PHONE.test(phone)) throw new Error("휴대폰 번호 꼴이 아니다");
}

const aad = (accountId: string) => Buffer.from(`fankkuk.phone.${VERSION}:${accountId}`, "utf8");

/** 번호를 그 계정에 묶어 암호화한다. */
export function encryptPhone(keys: PhoneKeys, accountId: string, phone: string): string {
  assertPhone(phone);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keys.encKey, iv);
  cipher.setAAD(aad(accountId));
  const body = Buffer.concat([cipher.update(phone, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${VERSION}.${iv.toString("base64url")}.${body.toString("base64url")}`;
}

/** 그 계정의 암호문을 푼다. 다른 계정 것·고친 값·다른 키·꼴이 틀린 값이면 null. */
export function decryptPhone(keys: PhoneKeys, accountId: string, sealed: string): string | null {
  const [version, ivPart, bodyPart, extra] = sealed.split(".");
  if (version !== VERSION || !ivPart || !bodyPart || extra !== undefined) return null;
  try {
    const iv = Buffer.from(ivPart, "base64url");
    const body = Buffer.from(bodyPart, "base64url");
    if (iv.length !== 12 || body.length <= 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", keys.encKey, iv);
    decipher.setAAD(aad(accountId));
    decipher.setAuthTag(body.subarray(body.length - 16));
    const phone = Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]).toString("utf8");
    return PHONE.test(phone) ? phone : null;
  } catch {
    return null;
  }
}

/** 같은 번호 찾기 해시(hex 64자). */
export function phoneHash(keys: PhoneKeys, phone: string): string {
  assertPhone(phone);
  return createHmac("sha256", keys.hashKey).update(`fankkuk.phone.${VERSION}:${phone}`).digest("hex");
}

/** 가린 번호 표시용 앞 3자리·뒤 4자리. */
export function phoneParts(phone: string): { prefix: string; last4: string } {
  assertPhone(phone);
  return { prefix: phone.slice(0, 3), last4: phone.slice(-4) };
}

/** DB 에 넘기는 번호 묶음(JSON 글자) — 해시·암호문·앞 3자리·뒤 4자리. 계정 만들기·번호 바꾸기 함수의 p_phone 자리에 넣는다(0028 pii.phone_bundle 이 꼴을 본다). */
export function phoneBundle(keys: PhoneKeys, accountId: string, phone: string): string {
  const { prefix, last4 } = phoneParts(phone);
  return JSON.stringify({ hash: phoneHash(keys, phone), sealed: encryptPhone(keys, accountId, phone), prefix, last4 });
}
