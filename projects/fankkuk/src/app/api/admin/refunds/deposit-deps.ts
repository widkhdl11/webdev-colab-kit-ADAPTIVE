import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { RefundDeps } from "@/features/admin-refund/model/run-refund";
import { openRefundAccount, readRefundAccountKey } from "@/features/refund-account/model/sealed-account";

// 환불 실행의 무통장 부분 조립 (payment INV-M25). 앱 서버 키 클라이언트로 읽는다 — 두 함수 모두 앱 서버 키만 부를 수 있다.
// 무통장인지는 마이그레이션의 refund_is_deposit, 계좌는 개인정보 구역 파일(manual/0019)의 refund_account_sealed 가 돌려준다.
// 봉인값은 서버 비밀 키로 여기서만 연다. 연 값은 결제사 취소 요청에만 쓰고 기록·응답에 남기지 않는다.

const accountRows = z.array(z.object({ bank_code: z.string().regex(/^[0-9A-Z]{2,3}$/), sealed: z.string() }));

export function refundDepositDeps(admin: Pick<SupabaseClient, "rpc">, env: Record<string, string | undefined>): RefundDeps["deposit"] {
  return {
    async isDeposit(refundId) {
      const { data, error } = await admin.rpc("refund_is_deposit", { p_refund_id: refundId });
      if (error) throw new Error(`무통장 결제인지 읽지 못했다: ${error.code}`);
      return data === true;
    },
    async account(refundId) {
      const { data, error } = await admin.rpc("refund_account_sealed", { p_refund_id: refundId });
      if (error) throw new Error(`환불 계좌를 읽지 못했다: ${error.code}`);
      const row = accountRows.parse(data)[0];
      if (!row) return null;
      const opened = await openRefundAccount(readRefundAccountKey(env), row.sealed);
      if (!opened) throw new Error("환불 계좌 봉인을 열지 못했다");
      return { bank: row.bank_code, accountNumber: opened.accountNumber, holderName: opened.holderName };
    },
  };
}
