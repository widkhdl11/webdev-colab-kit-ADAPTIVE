import { isRevgiftOrderNo } from "@/entities/revgift/model/revgift-order-no";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬의 받지 않기(INV-R10). 누구 몫인지는 DB 가 로그인 토큰으로 판정한다. 받지 않은 이유는 크리에이터에게 알리지 않는다(INV-R8).
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  return handlePrivateJsonPost(req, async () => {
    if (!isRevgiftOrderNo(orderNo)) return { status: 404, body: { message: "선물을 찾을 수 없어요." } };
    const supabase = await createRequestSupabase();
    const { error } = await supabase.rpc("decline_revgift", { p_order_no: orderNo });
    if (!error) return { status: 200, body: { declined: true } };
    if (error.code === "P0002" || error.code === "42501") return { status: 404, body: { message: "선물을 찾을 수 없어요." } };
    if (error.code === "P0022") return { status: 409, body: { message: "이미 정했거나 기한이 지난 선물이에요." } };
    throw new Error(`받지 않기를 저장하지 못했다: ${error.code}`);
  });
}
