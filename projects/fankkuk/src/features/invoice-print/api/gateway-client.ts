import { z } from "zod";
import { ACCESS_DENY_REASONS } from "@/entities/address/model/access-log";
import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";
import type { InvoiceDecryptor, ReturnLabelPrinter } from "./invoice-decryptor";

// 앱 서버 → 서명 게이트웨이(sign.fankkuk.com)의 송장 출력 요청. 주소를 여는 것은 게이트웨이다(address-protection 「복호화 함수」) —
// 앱 서버는 로그인 토큰과 QR 만 보내고, 판정·키 풀기·열람 기록은 게이트웨이가 한다. 앱 서버에는 KMS·복호화 DB 자격이 없다(INV-P2·P3).
// 게이트웨이 토큰(SIGN_GATEWAY_TOKEN)은 「이 앱 서버가 보냈다」만 증명한다 — 주소를 열 자격은 대표의 로그인 토큰이 따로 정한다(INV-P8).
// 응답은 꼴을 검사해 맞는 것만 넘긴다. 연결 실패·꼴 틀림은 failed — 다시 시도하면 되는 오류와 거부를 섞지 않는다.

const label = z.object({
  recipientName: z.string(),
  phone: z.string(),
  zipCode: z.string(),
  address1: z.string(),
  address2: z.string(),
});

const common = [
  z.object({ kind: z.literal("printed"), waybill: z.string().min(1), reprint: z.boolean(), label }),
  z.object({ kind: z.literal("denied"), reason: z.enum(ACCESS_DENY_REASONS) }),
  z.object({ kind: z.literal("unauthenticated") }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("failed") }),
] as const;

const labelReply = z.union([...common, z.object({ kind: z.literal("no_address") })]);
const returnReply = z.union([...common, z.object({ kind: z.literal("not_linked") })]);

export type GatewayConfig = { url: string; token: string };

/** 게이트웨이 설정. 주소가 없으면 null(로컬 송장 출력 함수를 쓴다). 운영에서는 https 만 받는다. */
export function readGatewayConfig(env: DeployEnv & Record<string, string | undefined>): GatewayConfig | null {
  const raw = env.SIGN_GATEWAY_URL?.trim();
  if (!raw) return null;
  const token = env.SIGN_GATEWAY_TOKEN?.trim() ?? "";
  if (token.length < 32) throw new Error("SIGN_GATEWAY_TOKEN 이 없거나 짧다");
  const url = new URL(raw);
  if (url.protocol !== "https:" && isProduction(env)) throw new Error("SIGN_GATEWAY_URL 은 https 여야 한다");
  return { url: url.origin, token };
}

async function call<T>(
  cfg: GatewayConfig,
  path: string,
  input: { qr: string; accessToken: string },
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch,
  failed: T,
): Promise<T> {
  try {
    const res = await fetchImpl(`${cfg.url}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify({ qr: input.qr, accessToken: input.accessToken }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) {
      console.error("서명 게이트웨이 송장 출력 응답", res.status);
      return failed;
    }
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) {
      console.error("서명 게이트웨이 송장 출력 응답 꼴이 틀림");
      return failed;
    }
    return parsed.data;
  } catch (e) {
    console.error("서명 게이트웨이 송장 출력 요청 실패", e instanceof Error ? e.name : typeof e);
    return failed;
  }
}

export function createGatewayLabelPrinters(
  cfg: GatewayConfig,
  fetchImpl: typeof fetch = fetch,
): { printLabel: InvoiceDecryptor; printReturnLabel: ReturnLabelPrinter } {
  return {
    printLabel: (input) => call(cfg, "/v1/invoice/label", input, labelReply, fetchImpl, { kind: "failed" }),
    printReturnLabel: (input) => call(cfg, "/v1/invoice/return-label", input, returnReply, fetchImpl, { kind: "failed" }),
  };
}
