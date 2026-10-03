import { isRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import { parseAcceptInput } from "@/entities/revgift/model/sealed-address";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬의 받기 — 봉인된 주소를 그 몫에 넣는다(INV-R4·R5). 평문 주소는 받지 않는다.
// 누구 몫인지·받을 수 있는 상태인지는 DB 받기 함수가 로그인 토큰으로 판정한다 — 관리자 키를 쓰지 않는다.
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  return handlePrivateJsonPost(req, async (body) => {
    if (!isRevgiftOrderNo(orderNo)) return { status: 404, body: { message: "선물을 찾을 수 없어요." } };
    const input = parseAcceptInput(body);
    if (!input.ok) return { status: 400, body: { message: "주소를 다시 입력해 주세요." } };
    const supabase = await createRequestSupabase();
    const { error } = await supabase.rpc("accept_revgift", { p_order_no: orderNo, p_envelope: input.envelope });
    if (!error) return { status: 200, body: { accepted: true } };
    if (error.code === "P0002" || error.code === "42501") return { status: 404, body: { message: "선물을 찾을 수 없어요." } };
    if (error.code === "P0022") return { status: 409, body: { message: "이미 정했거나 기한이 지난 선물이에요." } };
    if (error.code === "22023") return { status: 400, body: { message: "주소를 다시 입력해 주세요." } };
    throw new Error(`받기를 저장하지 못했다: ${error.code}`);
  });
}
