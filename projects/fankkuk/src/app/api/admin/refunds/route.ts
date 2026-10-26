import type { NextRequest } from "next/server";
import { runRefund } from "@/features/admin-refund/model/run-refund";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { createTossPaymentsClient, readTossSecretKey } from "@/shared/api/toss-payments/client";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 환불 실행 (admin-console INV-K2·K7). 같은 사이트의 JSON 만, 응답은 캐시하지 않는다.
// 잡기(금액 계산)는 로그인한 사람의 세션 클라이언트로 — 대표인지는 DB 가 그 토큰의 사람으로 판정한다.
// 관리자 키는 결과 기록에만 쓴다: 잡기에 쓰면 DB 의 대표 판정이 서버 계정 기준이 되어 직원도 환불된다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => {
    const env = process.env;
    return runRefund(
      {
        session: await createRequestSupabase(),
        admin: createAdminSupabase(),
        toss: createTossPaymentsClient({ secretKey: readTossSecretKey(env), fetchImpl: fetch }),
      },
      body,
    );
  });
}
