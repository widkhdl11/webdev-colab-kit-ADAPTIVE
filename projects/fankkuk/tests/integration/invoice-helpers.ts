import { createHmac } from "node:crypto";
import { creatorAddressPlaintext } from "@/entities/address/model/creator-address-plaintext";
import { importSealingPublicKey, sealEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { psql } from "./helpers";

// 송장 출력(주소 열기) 통합 시험 공용 — address-protection INV-P4·P5·P7·P8·P12·P14.
// 시험은 자기 키 쌍을 만들어 하루의 주소 칸에 넣고, 끝나면 원래 값(화면 확인용 주소)으로 되돌린다.

export const OWNER_ID = "00000000-0000-4000-a000-000000000021"; // 팬꾹 운영(대표)
export const STAFF_ID = "00000000-0000-4000-a000-000000000022"; // 팬꾹 직원
export const HARU_CREATOR_ID = "00000000-0000-4000-b000-000000000001";
export const MOMO_CREATOR_ID = "00000000-0000-4000-b000-000000000002";

export const LABEL = {
  recipientName: "시험하루",
  phone: "01099990000",
  zipCode: "06236",
  address1: "서울시 강남구 시험로 1",
  address2: "시험동 101호",
} as const;

export type TestKeys = { publicKey: CryptoKey; privatePem: string };

export async function testKeyPair(): Promise<TestKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["encrypt", "decrypt"],
  );
  const pem = (label: string, der: ArrayBuffer) => `-----BEGIN ${label}-----\n${Buffer.from(der).toString("base64")}\n-----END ${label}-----`;
  return {
    publicKey: await importSealingPublicKey(pem("PUBLIC KEY", await crypto.subtle.exportKey("spki", pair.publicKey))),
    privatePem: pem("PRIVATE KEY", await crypto.subtle.exportKey("pkcs8", pair.privateKey)),
  };
}

/** 그 크리에이터 식별값으로 봉인한 시험 주소. */
export function sealTestAddress(keys: TestKeys, creatorId: string): Promise<Envelope> {
  return sealEnvelope(creatorAddressPlaintext({ creatorId, ...LABEL }), keys.publicKey);
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** 하루의 주소 칸을 봉투로 바꾼다(등록 기록은 남기지 않는다 — 시험 준비). */
export function putHaruEnvelope(envelope: Envelope): void {
  psql(
    `insert into pii.creator_addresses (creator_id, envelope, updated_at) values ('${HARU_CREATOR_ID}', ${q(JSON.stringify(envelope))}::jsonb, now()) on conflict (creator_id) do update set envelope = excluded.envelope`,
  );
}

/** 지금 하루의 주소 칸(없으면 null) — 끝에 되돌리려고 적어 둔다. */
export function saveHaruAddress(): { envelope: string; updatedAt: string } | null {
  const row = psql(`select envelope::text || '|' || updated_at::text from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}'`);
  if (row === "") return null;
  const cut = row.lastIndexOf("|");
  return { envelope: row.slice(0, cut), updatedAt: row.slice(cut + 1) };
}

export function restoreHaruAddress(saved: { envelope: string; updatedAt: string } | null): void {
  if (!saved) {
    psql(`delete from pii.creator_addresses where creator_id = '${HARU_CREATOR_ID}'`);
    return;
  }
  psql(
    `update pii.creator_addresses set envelope = ${q(saved.envelope)}::jsonb, updated_at = ${q(saved.updatedAt)}::timestamptz where creator_id = '${HARU_CREATOR_ID}'`,
  );
}

function b64url(v: Buffer | string): string {
  return Buffer.from(v).toString("base64url");
}

/** 복호화 전용 역할(address_decryptor)의 DB 토큰 — 송장 출력 함수의 자격. 로컬 JWT 비밀로 서명한다. */
export function decryptorDbKey(): string {
  const secret = process.env.FK_TEST_JWT_SECRET ?? "";
  if (secret === "") throw new Error("FK_TEST_JWT_SECRET 이 없다");
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ role: "address_decryptor", iss: "supabase-demo", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

/** 송장 출력 함수 자신의 설정 파일 꼴(.env.decrypt.local 과 같은 줄). */
export function decryptFileText(keys: TestKeys, ownerUserId = OWNER_ID): string {
  const oneLine = (v: string) => v.replaceAll("\n", "\\n");
  return [`DEV_ADDRESS_PRIVATE_KEY="${oneLine(keys.privatePem)}"`, `DECRYPT_DB_KEY=${decryptorDbKey()}`, `DECRYPT_OWNER_USER_ID=${ownerUserId}`, ""].join("\n");
}

export function logRows(orderId: string): string[] {
  const out = psql(
    `select result || ':' || coalesce(print_no::text, deny_reason) || ':' || requester_id from public.decrypt_log where order_id = '${orderId}' order by id`,
  );
  return out === "" ? [] : out.split("\n");
}
