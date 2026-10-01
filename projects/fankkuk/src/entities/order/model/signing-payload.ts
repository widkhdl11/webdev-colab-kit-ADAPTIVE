import { z } from "zod";
import { ORDER_NO_PATTERN } from "./order-no";

// INV-S1: 서명 원문은 요청 ID·주문번호·요청 시각·팬 닉네임 해시 네 값으로만 이루어진다.
// 원문은 카카오·딜러사를 거치므로 주소·실명·선물 내용이 들어갈 칸이 없어야 한다.
// 칸마다 형식을 좁혀 두는 이유: 구분자(|)나 임의 문자열이 칸 안에 들어오면 다른 정보를 숨겨 넣을 수 있다.

const PREFIX = "fankkuk-approval:v1";

const fieldsSchema = z
  .object({
    requestId: z.string().regex(/^apr_[0-9A-Za-z]{1,40}$/),
    orderNo: z.string().regex(ORDER_NO_PATTERN),
    requestedAt: z.iso.datetime(),
    fanNicknameHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type SigningFields = z.infer<typeof fieldsSchema>;

export function buildSigningPayload(fields: SigningFields): string {
  const f = fieldsSchema.parse(fields);
  return `${PREFIX}|req=${f.requestId}|order=${f.orderNo}|at=${f.requestedAt}|fan=${f.fanNicknameHash}`;
}

const PAYLOAD_PATTERN = /^fankkuk-approval:v1\|req=([^|]+)\|order=([^|]+)\|at=([^|]+)\|fan=([^|]+)$/;

/** 원문을 칸으로 되돌린다. 형식이 다르거나 칸이 더 있으면 null. */
export function parseSigningPayload(payload: string): SigningFields | null {
  const m = PAYLOAD_PATTERN.exec(payload);
  if (!m) return null;
  const parsed = fieldsSchema.safeParse({ requestId: m[1], orderNo: m[2], requestedAt: m[3], fanNicknameHash: m[4] });
  return parsed.success ? parsed.data : null;
}
