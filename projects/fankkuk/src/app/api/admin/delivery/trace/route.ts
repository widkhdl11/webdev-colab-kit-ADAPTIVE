import type { NextRequest } from "next/server";
import { ingestTrackingItems, readTraceTargets } from "@/features/delivery-tracking/api/delivery-db";
import { deliveryApiFromEnv } from "@/features/delivery-tracking/api/server-deps";
import { runManualTrace } from "@/features/delivery-tracking/model/manual-trace";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 운영자 수동 조회 (delivery-status INV-DS14) — 몸통 { ids: [조회 줄 ID…] }. 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 운영자 판정·송장번호는 로그인한 사람의 세션으로 DB 가 한다(운영자가 아니면 404). 받은 결과의 저장만 서버 키로 한다 — 웹훅과 같은 수신 처리.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const session = await createRequestSupabase();
    return runManualTrace(
      {
        api: deliveryApiFromEnv(),
        targets: (ids) => readTraceTargets(session, ids),
        ingest: (items) => ingestTrackingItems(createAdminSupabase(), items, "trace"),
      },
      body,
    );
  });
}
