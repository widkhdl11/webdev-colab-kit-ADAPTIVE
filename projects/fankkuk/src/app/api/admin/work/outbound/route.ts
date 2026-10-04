import type { NextRequest } from "next/server";
import { devWaybillNo } from "@/features/office-outbound/model/dev-waybill";
import { scanOutbound } from "@/features/office-outbound/model/scan-outbound";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 출고 — QR 로 불러오기·송장 출력(대표만)·출고 확정·반송 송장 출력·반송 확정 (office-workflow INV-W1·W3·W8).
// 같은 사이트의 JSON 만, 응답은 캐시하지 않는다. 로그인한 사람의 세션 클라이언트로 DB 를 부른다 —
// 관리자 키를 쓰면 DB 의 대표 판정이 서버 계정 기준이 되어 직원도 주소를 연다.
// 송장번호는 택배사 API 가 아직 없어 개발용 난수(devWaybillNo)로 만든다. 택배사 API 가 붙으면 newWaybill 을 그 호출로 바꾼다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => scanOutbound({ client: await createRequestSupabase(), newWaybill: devWaybillNo }, body));
}
