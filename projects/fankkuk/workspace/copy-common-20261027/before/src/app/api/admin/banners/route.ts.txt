import { BANNER_BODY_LIMIT, BANNER_IMAGE_MESSAGE } from "@/features/admin-banner-edit/model/banner-image";
import { bannerGate, saveBanner } from "@/features/admin-banner-edit/model/save-banner";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOrigin } from "@/shared/lib/http/same-origin";

// 광고 배너 만들기·고치기 (docs/specs/banners.md INV-Y1·Y3·Y4·Y6). 양식 한 장 — 글 칸(data, JSON)과 그림(image, 고를 때만).
// 같은 사이트의 요청만. 본문(파일)을 읽기 전에 운영자 확인(아니면 404)·크기 밝힘(411)·상한(400)을 먼저 거른다.
// DB 는 운영자의 세션으로(기록에 그 사람이 남는다), 저장소 쓰기만 서버의 비밀 키로. 응답은 캐시하지 않는다.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  try {
    const session = await createRequestSupabase();
    const denied = await bannerGate(session);
    if (denied) return Response.json(denied.body, { status: denied.status, headers: NO_STORE });
    const declared = req.headers.get("content-length");
    if (declared === null || !/^\d+$/.test(declared)) {
      return Response.json({ message: "그림 크기를 알 수 없는 요청이에요. 다시 올려 주세요." }, { status: 411, headers: NO_STORE });
    }
    if (Number(declared) > BANNER_BODY_LIMIT) return Response.json({ message: BANNER_IMAGE_MESSAGE.too_large_file, field: "image" }, { status: 400, headers: NO_STORE });
    let input: unknown = null;
    let image: Blob | null = null;
    try {
      const form = await req.formData();
      const data = form.get("data");
      input = typeof data === "string" ? JSON.parse(data) : null;
      const file = form.get("image");
      image = file instanceof Blob && file.size > 0 ? file : null;
    } catch {
      input = null;
    }
    const reply = await saveBanner({ session, storage: createAdminSupabase().storage }, input, image);
    return Response.json(reply.body, { status: reply.status, headers: NO_STORE });
  } catch (e) {
    console.error("banner: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return Response.json({ message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500, headers: NO_STORE });
  }
}
