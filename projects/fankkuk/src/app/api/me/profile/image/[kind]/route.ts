import { readViewer, type Viewer } from "@/entities/session/model/viewer";
import { fanImageGate, parseFanImageKind, removeFanImage, saveFanImage, type FanImageResult } from "@/features/fan-profile-edit/model/save-fan-image";
import type { FanImageKind } from "@/entities/fan/model/fan-profile";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { PHOTO_BODY_LIMIT } from "@/shared/lib/image/photo-limits";
import { PHOTO_PROBLEM_MESSAGE } from "@/shared/lib/image/photo-problem";
import { isSameOrigin } from "@/shared/lib/http/same-origin";

// 팬 프로필 사진(/api/me/profile/image/photo)·배경 사진(/api/me/profile/image/background) 올리기(POST, 파일 칸 photo)·지우기(DELETE)
// — my-account INV-A14. 팬 사진 저장소에 쓰는 길은 이 라우트 하나다. 크리에이터 사진 라우트(/api/creator/photo)와 같은 방식이다:
// 같은 사이트의 요청만, 사람은 세션에서 확인한 팬만, 저장소 쓰기는 서버의 비밀 키로. 응답은 캐시하지 않는다.
// 본문(파일)을 읽기 전에 사람 확인·크기 밝힘(411)·상한을 먼저 거른다. 상한을 넘으면 400(스펙 S14b — 「11MB 파일 → 400」).

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Ctx = { params: Promise<{ kind: string }> };

function reply(result: FanImageResult): Response {
  return result.ok
    ? Response.json({ path: result.path }, { status: 200, headers: NO_STORE })
    : Response.json({ message: result.message }, { status: result.status, headers: NO_STORE });
}

type Work = (deps: { admin: ReturnType<typeof createAdminSupabase>; viewer: Viewer }, kind: FanImageKind) => Promise<FanImageResult | Response>;

async function run(req: Request, ctx: Ctx, work: Work): Promise<Response> {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  const kind = parseFanImageKind((await ctx.params).kind);
  if (!kind) return Response.json({ message: "없는 주소예요." }, { status: 404, headers: NO_STORE });
  try {
    const viewer = await readViewer(await createRequestSupabase());
    const denied = fanImageGate(viewer);
    if (denied || !viewer) return reply(denied ?? { ok: false, status: 401, message: "로그인이 필요해요." });
    const result = await work({ admin: createAdminSupabase(), viewer }, kind);
    return result instanceof Response ? result : reply(result);
  } catch (e) {
    console.error("fan-photo: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return Response.json({ message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  return run(req, ctx, async (deps, kind) => {
    const declared = req.headers.get("content-length");
    if (declared === null || !/^\d+$/.test(declared)) {
      return Response.json({ message: "사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요." }, { status: 411, headers: NO_STORE });
    }
    if (Number(declared) > PHOTO_BODY_LIMIT) return Response.json({ message: PHOTO_PROBLEM_MESSAGE.too_large_file }, { status: 400, headers: NO_STORE });
    let file: Blob | null = null;
    try {
      const value = (await req.formData()).get("photo");
      file = value instanceof Blob ? value : null;
    } catch {
      file = null;
    }
    return saveFanImage(deps, kind, file);
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  return run(req, ctx, (deps, kind) => removeFanImage(deps, kind));
}
