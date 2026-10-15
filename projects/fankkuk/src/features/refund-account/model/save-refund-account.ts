import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { readRefundAccountKey, sealRefundAccount } from "./sealed-account";

// 팬의 환불 계좌 넣기 (payment INV-M25) — 무통장으로 낸 내 주문의 환불을 받을 계좌를 한 번 넣는다.
// 로그인한 사람의 세션 클라이언트로 DB 를 부른다 — 누구 주문인지·무통장 결제인지는 DB(set_my_refund_account)가 그 토큰으로 판정한다.
// 계좌번호·예금주는 여기서 봉인해 넘긴다. 돌려주는 것은 은행 코드와 끝 네 자리뿐이다(화면·기록에도 그것만).
// 받는 값: { orderNo, bankCode(토스 은행 코드), accountNumber(숫자, 하이픈·공백은 지운다, 6~20자리), holderName(1~60자) }.

export type SaveRefundAccountDeps = { session: Pick<SupabaseClient, "rpc">; env: Record<string, string | undefined> };

const bodyShape = z
  .object({
    orderNo: z.string().regex(/^FC-[0-9A-Z]{3,10}(-[0-9]{1,2})?$/),
    bankCode: z.string().regex(/^[0-9A-Z]{2,3}$/),
    accountNumber: z
      .string()
      .transform((v) => v.replace(/[\s-]/g, ""))
      .pipe(z.string().regex(/^[0-9]{6,20}$/)),
    holderName: z
      .string()
      .transform((v) => v.trim())
      .pipe(z.string().min(1).max(60)),
  })
  .strict();

const MESSAGE = {
  badRequest: "계좌 정보를 다시 확인해 주세요.",
  notFound: "환불 계좌를 넣을 수 있는 주문이 아니에요.",
  inProgress: "환불을 처리하고 있어요. 잠시 뒤 다시 해 주세요.",
  failed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
} as const;

export async function saveRefundAccount(deps: SaveRefundAccountDeps, body: unknown): Promise<JsonReply> {
  const input = bodyShape.safeParse(body);
  if (!input.success) return { status: 400, body: { message: MESSAGE.badRequest } };
  const { orderNo, bankCode, accountNumber, holderName } = input.data;
  const sealed = await sealRefundAccount(readRefundAccountKey(deps.env), { accountNumber, holderName });
  const last4 = accountNumber.slice(-4);
  const { error } = await deps.session.rpc("set_my_refund_account", {
    p_order_no: orderNo,
    p_bank_code: bankCode,
    p_last4: last4,
    p_sealed: sealed,
  });
  if (error?.code === "P0002" || error?.code === "42501") return { status: 404, body: { message: MESSAGE.notFound } };
  if (error?.code === "P0024") return { status: 409, body: { message: MESSAGE.inProgress } };
  if (error) return { status: 500, body: { message: MESSAGE.failed } };
  return { status: 200, body: { bankCode, last4 } };
}
