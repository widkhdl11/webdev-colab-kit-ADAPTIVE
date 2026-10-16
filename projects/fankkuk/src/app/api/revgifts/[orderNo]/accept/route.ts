import { isRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬의 받기 — 팬이 설정에 등록한 받을 주소를 그 몫에 복사한다(reverse-gift INV-R4·R6, address-protection INV-P17).
// 본문에는 아무것도 싣지 않는다 — 주소는 받기 전에 등록 주소로 저장돼 있고(INV-R5 — 봉인된 값만), 복사는 DB 받기 함수가 한다.
// 누구 몫인지·받을 수 있는 상태인지·등록 주소가 있는지는 DB 받기 함수가 로그인 토큰으로 판정한다 — 관리자 키를 쓰지 않는다.
// 등록 주소가 없으면 422(reason: no_address) — 화면이 그 자리에서 주소를 먼저 등록시킨다.
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  return handlePrivateJsonPost(req, async () => {
    if (!isRevgiftOrderNo(orderNo)) return { status: 404, body: { message: "선물을 찾을 수 없어요." } };
    const supabase = await createRequestSupabase();
    const { error } = await supabase.rpc("accept_revgift", { p_order_no: orderNo });
    if (!error) return { status: 200, body: { accepted: true } };
    if (error.code === "P0002" || error.code === "42501") return { status: 404, body: { message: "선물을 찾을 수 없어요." } };
    if (error.code === "P0022") return { status: 409, body: { message: "이미 정했거나 기한이 지난 선물이에요." } };
    if (error.code === "P0026") return { status: 422, body: { message: "받을 주소를 먼저 입력해 주세요.", reason: "no_address" } };
    throw new Error(`받기를 저장하지 못했다: ${error.code}`);
  });
}
