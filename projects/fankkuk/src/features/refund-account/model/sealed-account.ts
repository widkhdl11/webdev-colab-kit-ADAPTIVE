import { z } from "zod";

// 환불 계좌 봉인 (payment INV-M25). 계좌번호·예금주는 앱 서버 비밀 키(REFUND_ACCOUNT_KEY, 32바이트 base64)로
// AES-256-GCM 봉인해 개인정보 구역에 둔다 — DB 만으로는 열 수 없다. 여는 곳은 대표의 환불 실행 한 곳뿐이다.
// 봉인값 꼴: 「v1.<iv 12바이트 base64>.<암호문+인증 태그 base64>」(manual/0019 의 꼴 검사와 같다).

export type RefundAccountSecret = { accountNumber: string; holderName: string };

/** INV-M4 와 같은 방식 — 공개 접두어로도 설정돼 있으면 시작하지 않는다. 32바이트가 아니면 실패. */
export function readRefundAccountKey(env: Record<string, string | undefined>): string {
  if (env.NEXT_PUBLIC_REFUND_ACCOUNT_KEY !== undefined) {
    throw new Error("환불 계좌 키가 공개 환경 변수(NEXT_PUBLIC_)로 설정돼 있다 — 지우고 다시 시작한다");
  }
  const key = env.REFUND_ACCOUNT_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) throw new Error("REFUND_ACCOUNT_KEY(32바이트 base64)가 없다");
  return key;
}

const SEALED = /^v1\.([A-Za-z0-9+/]{16})\.([A-Za-z0-9+/]+={0,2})$/;
const secretShape = z.object({ a: z.string(), h: z.string() }).strict();

async function importKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", Buffer.from(keyB64, "base64"), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function sealRefundAccount(keyB64: string, secret: RefundAccountSecret): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ a: secret.accountNumber, h: secret.holderName }));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(keyB64), plain));
  return `v1.${Buffer.from(iv).toString("base64")}.${Buffer.from(ct).toString("base64")}`;
}

/** 열지 못하면(꼴이 다름·키가 다름·변조) null. */
export async function openRefundAccount(keyB64: string, sealed: string): Promise<RefundAccountSecret | null> {
  const m = SEALED.exec(sealed);
  if (!m) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(m[1]!, "base64") },
      await importKey(keyB64),
      Buffer.from(m[2]!, "base64"),
    );
    const parsed = secretShape.safeParse(JSON.parse(new TextDecoder().decode(plain)));
    return parsed.success ? { accountNumber: parsed.data.a, holderName: parsed.data.h } : null;
  } catch {
    return null;
  }
}
