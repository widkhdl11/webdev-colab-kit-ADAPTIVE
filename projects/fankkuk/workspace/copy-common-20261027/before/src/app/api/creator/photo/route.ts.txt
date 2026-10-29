import { readViewer, type Viewer } from "@/entities/session/model/viewer";
import { PHOTO_BODY_LIMIT } from "@/shared/lib/image/photo-limits";
import { photoGate } from "@/features/creator-photo/model/photo-slot";
import { removeCreatorPhoto, saveCreatorPhoto, type PhotoResult } from "@/features/creator-photo/model/save-creator-photo";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOrigin } from "@/shared/lib/http/same-origin";

// 프로필 사진 올리기(POST, 파일 칸 photo)·지우기(DELETE) — creator-link INV-E1·E9. 사진 저장소에 쓰는 길은 이 라우트 하나다.
// 같은 사이트의 요청만 받고, 사람은 세션에서 확인한 크리에이터만. 저장소 쓰기는 서버의 비밀 키로 한다. 응답은 캐시하지 않는다.
// 올리기는 본문(파일)을 읽기 전에 거를 것을 먼저 거른다 — 사람 확인(로그인·크리에이터), 크기를 밝혔는지(411), 상한(413).
// 상한은 Next 프록시 본문 상한(next.config.ts proxyClientMaxBodySize)과 같은 값이다 — 프록시가 먼저 자르면 정상 사진이 잘린다(S9).

const NO_STORE = { "Cache-Control": "no-store" } as const;

function reply(result: PhotoResult): Response {
  return result.ok
    ? Response.json({ photoPath: result.photoPath }, { status: 200, headers: NO_STORE })
    : Response.json({ message: result.message }, { status: result.status, headers: NO_STORE });
}

type Work = (deps: { admin: ReturnType<typeof createAdminSupabase>; viewer: Viewer }) => Promise<PhotoResult | Response>;

async function run(req: Request, work: Work): Promise<Response> {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  try {
    const viewer = await readViewer(await createRequestSupabase());
    const denied = photoGate(viewer, "프로필 사진");
    if (denied || !viewer) return reply(denied ?? { ok: false, status: 401, message: "로그인이 필요합니다." });
    const result = await work({ admin: createAdminSupabase(), viewer });
    return result instanceof Response ? result : reply(result);
  } catch (e) {
    console.error("creator-photo: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return Response.json({ message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  return run(req, async (deps) => {
    const declared = req.headers.get("content-length");
    if (declared === null || !/^\d+$/.test(declared)) {
      return Response.json({ message: "사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요." }, { status: 411, headers: NO_STORE });
    }
    if (Number(declared) > PHOTO_BODY_LIMIT) return Response.json({ message: "사진은 최대 10MB까지 업로드할 수 있습니다." }, { status: 413, headers: NO_STORE });
    let file: Blob | null = null;
    try {
      const value = (await req.formData()).get("photo");
      file = value instanceof Blob ? value : null;
    } catch {
      file = null;
    }
    return saveCreatorPhoto(deps, file);
  });
}

export async function DELETE(req: Request) {
  return run(req, (deps) => removeCreatorPhoto(deps));
}
