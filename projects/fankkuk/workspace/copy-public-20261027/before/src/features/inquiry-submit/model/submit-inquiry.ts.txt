import type { SupabaseClient } from "@supabase/supabase-js";
import { pgErrorReply } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { checkInquiryInput } from "./inquiry-input";

// 1:1 문의 남기기 (admin-console INV-K11, 결정 d25). 쓴 사람은 인자로 받지 않는다 —
// 로그인한 사람의 세션 클라이언트로 DB 를 부르면 DB 가 그 토큰의 사람으로 기록한다.
// 입력은 여기서 한 번, DB 함수에서 한 번 더 검사한다(같은 경계).

const MESSAGE_SIGN_IN = "로그인하고 문의를 남겨 주세요.";
const MESSAGE_FAILED = "보내지 못했어요. 잠시 뒤 다시 해 주세요.";
export const MESSAGE_RESTRICTED = "지금은 1:1 문의를 남길 수 없어요.";

/** client = 요청한 사람의 세션 클라이언트. 로그인하지 않았으면 DB 가 42501 로 거부한다 → 401. */
export async function submitInquiry(client: Pick<SupabaseClient, "rpc">, body: unknown): Promise<JsonReply> {
  const checked = checkInquiryInput(body);
  if (!checked.ok) return { status: 400, body: { message: checked.message, field: checked.field } };
  const { kind, title, body: text, orderNo } = checked.value;
  const { error } = await client.rpc("create_inquiry", { p_kind: kind, p_title: title, p_body: text, p_order_no: orderNo });
  if (error) {
    if (error.code === "42501") return { status: 401, body: { message: MESSAGE_SIGN_IN } };
    // INV-K12: 대표가 문의를 제한한 계정
    if (error.code === "P0051") return { status: 403, body: { message: MESSAGE_RESTRICTED } };
    return pgErrorReply(error.code, { limit: "입력한 내용을 다시 확인해 주세요.", failed: MESSAGE_FAILED });
  }
  return { status: 200, body: { ok: true } };
}
