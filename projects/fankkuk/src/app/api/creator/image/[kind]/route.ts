import { readViewer, type Viewer } from "@/entities/session/model/viewer";
import { photoGate } from "@/features/creator-photo/model/photo-slot";
import { IMAGE_LABEL, parseImageKind, removeCreatorImage, saveCreatorImage, type CreatorImageKind, type ImageResult } from "@/features/creator-photo/model/save-creator-image";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { PHOTO_BODY_LIMIT } from "@/shared/lib/image/photo-limits";
import { isSameOrigin } from "@/shared/lib/http/same-origin";

// 프로필 배경사진(/api/creator/image/background)·팬덤 심볼(/api/creator/image/symbol) 올리기(POST, 파일 칸 photo)·지우기(DELETE)
// — creator-link INV-E1·E9·E12. 프로필 사진 라우트(/api/creator/photo)와 같은 방식이다: 같은 사이트의 요청만, 사람은 세션에서 확인한 크리에이터만,
// 저장소 쓰기는 서버의 비밀 키로. 본문(파일)을 읽기 전에 사람 확인·크기 밝힘(411)·상한(413)을 먼저 거른다. 응답은 캐시하지 않는다.
// 응답은 새 경로(지웠으면 null)와 그 뒤의 미리보기 고르기 — 심볼을 떼면 DB 가 프로필 사진으로 되돌린 값을 화면이 받아 쓴다.
// 심볼은 양식 칸 rights=1(「내가 만들었거나 쓸 권리가 있는 이미지예요」 체크)이 있어야 저장한다(INV-E12) — 없으면 저장 함수가 거부한다.

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Ctx = { params: Promise<{ kind: string }> };

function reply(result: ImageResult): Response {
  return result.ok
    ? Response.json({ path: result.path, previewPick: result.previewPick }, { status: 200, headers: NO_STORE })
    : Response.json({ message: result.message }, { status: result.status, headers: NO_STORE });
}

type Work = (deps: { admin: ReturnType<typeof createAdminSupabase>; viewer: Viewer }, kind: CreatorImageKind) => Promise<ImageResult | Response>;

async function run(req: Request, ctx: Ctx, work: Work): Promise<Response> {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "유효하지 않은 요청입니다." }, { status: 403, headers: NO_STORE });
  const kind = parseImageKind((await ctx.params).kind);
  if (!kind) return Response.json({ message: "없는 주소예요." }, { status: 404, headers: NO_STORE });
  try {
    const viewer = await readViewer(await createRequestSupabase());
    const denied = photoGate(viewer, IMAGE_LABEL[kind]);
    if (denied || !viewer) return reply(denied ?? { ok: false, status: 401, message: "로그인이 필요합니다." });
    const result = await work({ admin: createAdminSupabase(), viewer }, kind);
    return result instanceof Response ? result : reply(result);
  } catch (e) {
    console.error("creator-image: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return Response.json({ message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  return run(req, ctx, async (deps, kind) => {
    const declared = req.headers.get("content-length");
    if (declared === null || !/^\d+$/.test(declared)) {
      return Response.json({ message: "이미지 크기를 확인할 수 없습니다. 파일을 다시 업로드해 주세요." }, { status: 411, headers: NO_STORE });
    }
    if (Number(declared) > PHOTO_BODY_LIMIT) return Response.json({ message: "사진은 최대 10MB까지 업로드할 수 있습니다." }, { status: 413, headers: NO_STORE });
    let file: Blob | null = null;
    let rightsChecked = false;
    try {
      const form = await req.formData();
      const value = form.get("photo");
      file = value instanceof Blob ? value : null;
      rightsChecked = form.get("rights") === "1";
    } catch {
      file = null;
    }
    return saveCreatorImage(deps, kind, file, { rightsChecked });
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return run(req, ctx, (deps, kind) => removeCreatorImage(deps, kind));
}
