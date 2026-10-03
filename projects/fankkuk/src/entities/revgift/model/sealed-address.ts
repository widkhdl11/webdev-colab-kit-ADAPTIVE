import { z } from "zod";
import { parseEnvelope, type Envelope } from "@/shared/lib/envelope/envelope";
import { REVGIFT_ORDER_NO_PATTERN } from "./revgift-order-no";

// INV-R5: 팬 주소는 팬 브라우저에서 봉인된 뒤에만 서버로 간다. 봉인하는 내용에는 택배 라벨에 필요한 값
// (받는 사람 이름·전화번호·주소)과 그 몫의 주문번호가 함께 들어간다 — 주문번호가 같이 묶여 있어야
// 서버를 장악한 사람이 한 몫의 암호문을 다른 몫에 옮겨 붙여도 송장 출력 때 걸린다(INV-R7 b).

const text = (max: number) => z.string().trim().min(1).max(max);

const plaintextSchema = z
  .object({
    v: z.literal(1),
    orderNo: z.string().regex(REVGIFT_ORDER_NO_PATTERN),
    recipientName: text(30),
    phone: z.string().regex(/^01[016789][0-9]{7,8}$/),
    zipCode: z.string().regex(/^[0-9]{5}$/),
    address1: text(120),
    address2: z.string().trim().max(120),
  })
  .strict();

export type RevgiftAddressInput = Omit<z.infer<typeof plaintextSchema>, "v">;

/** 봉인할 평문을 만든다. 칸이 하나라도 틀리면 만들지 않는다(브라우저에서 부른다). */
export function sealedAddressPlaintext(input: RevgiftAddressInput): string {
  return JSON.stringify(plaintextSchema.parse({ v: 1, ...input }));
}

/** 연 평문에서 주문번호를 꺼낸다. 꼴이 틀리면 null — 송장 출력이 그 내용을 쓰지 않는다. */
export function readOpenedOrderNo(plaintext: string): string | null {
  try {
    const parsed = plaintextSchema.safeParse(JSON.parse(plaintext));
    return parsed.success ? parsed.data.orderNo : null;
  } catch {
    return null;
  }
}

/** 받기 요청 본문. 봉인 형식이 아니면 거부한다(INV-R5) — 평문 주소가 들어올 자리가 없다. */
export function parseAcceptInput(body: unknown): { ok: true; envelope: Envelope } | { ok: false } {
  if (typeof body !== "object" || body === null || !("envelope" in body)) return { ok: false };
  const envelope = parseEnvelope((body as { envelope: unknown }).envelope);
  return envelope ? { ok: true, envelope } : { ok: false };
}
