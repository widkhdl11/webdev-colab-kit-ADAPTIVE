import type { NextRequest } from "next/server";
import { removeBanner } from "@/features/admin-banner-edit/model/save-banner";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 광고 배너 내리기 (docs/specs/banners.md INV-Y1·Y4·Y10). 운영자가 아니면 404. DB 는 운영자의 세션으로(기록에 그 사람이 남는다),
// 그림 파일 지우기만 서버의 비밀 키로.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => removeBanner({ session: await createRequestSupabase(), storage: createAdminSupabase().storage }, body));
}
