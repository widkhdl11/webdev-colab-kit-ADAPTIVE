import type { NextRequest } from "next/server";
import { orderBanners } from "@/features/admin-banner-edit/model/save-banner";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { handlePrivateJsonPost } from "@/shared/lib/http/private-json";

// 광고 배너 순서 정하기 (docs/specs/banners.md INV-Y1·Y8). 운영자가 아니면 404. 운영자의 세션으로 DB 를 부른다.
export async function POST(req: NextRequest) {
  return handlePrivateJsonPost(req, async (body) => orderBanners(await createRequestSupabase(), body));
}
