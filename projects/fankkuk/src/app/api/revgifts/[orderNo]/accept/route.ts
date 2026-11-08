import { acceptRevgiftWithAddress } from "@/features/revgift-receive/model/accept-revgift";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 팬의 받기 — 받기 창에서 봉인한 주소를 그 몫에 넣는다(reverse-gift INV-R4·R5·R6, address-protection INV-P17).
// 판정은 features/revgift-receive/model/accept-revgift — 로그인 토큰을 실은 요청용 클라이언트로 DB 받기 함수를 부른다.
export async function POST(req: Request, { params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  return handlePrivateJsonPost(req, async (body) => acceptRevgiftWithAddress({ client: await createRequestSupabase() }, orderNo, body));
}
