import { readViewer } from "@/entities/session/model/viewer";
import { PHOTO_MAX_BYTES } from "@/features/creator-photo/model/process-photo";
import { removeCreatorPhoto, saveCreatorPhoto, type PhotoResult } from "@/features/creator-photo/model/save-creator-photo";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { isSameOrigin } from "@/shared/lib/http/same-origin";

// 프로필 사진 올리기(POST, 파일 칸 photo)·지우기(DELETE) — creator-link INV-E1·E9. 사진 저장소에 쓰는 길은 이 라우트 하나다.
// 같은 사이트의 요청만 받고, 사람은 세션에서 확인한 크리에이터만. 저장소 쓰기는 서버의 비밀 키로 한다. 응답은 캐시하지 않는다.

const NO_STORE = { "Cache-Control": "no-store" } as const;
/** 파일 칸 말고 붙는 양식 경계·머리줄 몫까지 — 넘으면 본문을 읽지 않고 거부한다. */
const BODY_LIMIT = PHOTO_MAX_BYTES + 64 * 1024;

function reply(result: PhotoResult): Response {
  return result.ok
    ? Response.json({ photoPath: result.photoPath }, { status: 200, headers: NO_STORE })
    : Response.json({ message: result.message }, { status: result.status, headers: NO_STORE });
}

async function run(req: Request, work: (deps: Parameters<typeof saveCreatorPhoto>[0]) => Promise<PhotoResult>): Promise<Response> {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  try {
    const supabase = await createRequestSupabase();
    return reply(await work({ admin: createAdminSupabase(), viewer: await readViewer(supabase) }));
  } catch (e) {
    console.error("creator-photo: 처리 중 예외", e instanceof Error ? e.name : typeof e);
    return Response.json({ message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > BODY_LIMIT) return Response.json({ message: "사진은 10MB 까지 올릴 수 있어요." }, { status: 413, headers: NO_STORE });
  return run(req, async (deps) => {
    let file: Blob | null = null;
    try {
      const form = await req.formData();
      const value = form.get("photo");
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
