import { readViewer } from "@/entities/session/model/viewer";
import { startBoxPayment } from "@/features/revgift-box-pay/model/box-payment";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 명세서 결제 대기 만들기 (revgift-box INV-GB18). 주인·상태·금액은 DB 함수가 로그인 토큰으로 정한다 — 본문은 읽지 않는다.
// 응답에는 결제창에 필요한 값(주문 ID·금액)만 싣는다.
export async function POST(req: Request, { params }: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await params;
  return handlePrivateJsonPost(req, async () => {
    const supabase = await createRequestSupabase();
    const r = await startBoxPayment({ client: supabase, viewer: await readViewer(supabase) }, boxId);
    return r.ok ? { status: 200, body: { tossOrderId: r.tossOrderId, amountKrw: r.amountKrw } } : { status: r.status, body: { message: r.message } };
  });
}
