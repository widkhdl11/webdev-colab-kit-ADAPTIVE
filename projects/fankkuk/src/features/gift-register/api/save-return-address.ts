import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { SaveReturnAddress } from "../model/register-gift";

// 결제 대기 주문에 반송 주소 사본을 넣는다(payment INV-M25 ②). DB 함수가 로그인 토큰(auth.uid())으로 그 주문의 보낸 사람인지 판정하므로
// 로그인 토큰을 실은 요청용 클라이언트로 부른다 — 관리자 키로는 부를 수 없다(DB 가 서버 키 실행을 막는다). 계정 인자는 넘기지 않는다.

const reply = z.enum(["saved", "not_found", "closed"]);

export function createReturnAddressSaver(client: Pick<SupabaseClient, "rpc">): SaveReturnAddress {
  return async (orderNo, address, region) => {
    const { data, error } = await client.rpc("save_my_order_return_address", { p_order_no: orderNo, p_envelope: address, p_region: region });
    if (error) throw new Error(`반송 주소 사본을 넣지 못했다: ${error.code}`);
    // 꼴이 다르면 던진다 — 모르는 결과를 저장됨으로 치지 않는다
    return reply.parse(data);
  };
}
