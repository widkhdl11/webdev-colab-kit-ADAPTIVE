import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAddressInput } from "@/entities/address/model/address-ciphertext";
import { isRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 팬의 받기 — 받기 창에서 봉인한 주소를 그 몫에 넣는다(reverse-gift INV-R4·R5·R6, address-protection INV-P17 — 2026-11-08 팬 등록 주소를 없앴다).
// 본문에서는 봉인된 주소(address) 하나만 꺼낸다 — 봉인 꼴이 아니면 DB 를 부르기 전에 거부한다(INV-R5, 평문이 들어올 자리가 없다).
// 누구 몫인지·받을 수 있는 상태인지는 DB 받기 함수가 로그인 토큰으로 판정한다 — 관리자 키를 쓰지 않는다.

const NOT_FOUND: JsonReply = { status: 404, body: { message: "선물을 찾을 수 없습니다." } };
const NOT_SEALED: JsonReply = { status: 400, body: { message: "주소를 다시 입력해 주세요." } };

export async function acceptRevgiftWithAddress(deps: { client: Pick<SupabaseClient, "rpc"> }, orderNo: string, body: unknown): Promise<JsonReply> {
  if (!isRevgiftOrderNo(orderNo)) return NOT_FOUND;
  const input = parseAddressInput(body);
  if (!input.ok) return NOT_SEALED;
  const { error } = await deps.client.rpc("accept_revgift", { p_order_no: orderNo, p_envelope: input.value });
  if (!error) return { status: 200, body: { accepted: true } };
  if (error.code === "P0002" || error.code === "42501") return NOT_FOUND;
  if (error.code === "P0022") return { status: 409, body: { message: "이미 수락 여부를 선택했거나 기한이 지난 선물입니다." } };
  if (error.code === "22023") return NOT_SEALED;
  throw new Error(`받기를 저장하지 못했다: ${error.code}`);
}
