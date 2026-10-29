import { readViewer } from "@/entities/session/model/viewer";
import {
  giftPhotoGate,
  removeGiftPhoto,
  saveGiftPhoto,
  signGiftPhoto,
  type GiftPhotoDeps,
  type GiftPhotoResult,
} from "@/features/gift-photo/model/save-gift-photo";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { PHOTO_BODY_LIMIT } from "@/shared/lib/image/photo-limits";
import { isSameOrigin } from "@/shared/lib/http/same-origin";

// 팬이 올리는 선물 사진 — 보기(GET: 짧은 서명 주소로 넘기기)·올리기(POST, 파일 칸 photo)·지우기(DELETE). together INV-F2.
// 사진 저장소에 쓰고 서명 주소를 내주는 길은 이 라우트 하나다. 주인 확인은 로그인 클라이언트로 부르는 DB 본인 읽기 함수가 한다 —
// 남의 주문·사진 없음은 404(있는지도 알리지 않는다), 로그인 안 함은 401. 저장소 쓰기·서명은 서버의 비밀 키로 한다. 응답은 캐시하지 않는다.
// 올리기는 본문(파일)을 읽기 전에 거를 것을 먼저 거른다 — 같은 사이트·로그인·크기를 밝혔는지(411)·상한(413).
// 상한은 Next 프록시 본문 상한(next.config.ts proxyClientMaxBodySize)과 같은 값이다.

const NO_STORE = { "Cache-Control": "no-store" } as const;

type Ctx = { params: Promise<{ orderNo: string }> };

function reply(result: GiftPhotoResult): Response {
  return result.ok
    ? Response.json({ version: result.version }, { status: 200, headers: NO_STORE })
    : Response.json({ message: result.message }, { status: result.status, headers: NO_STORE });
}

async function depsOf(): Promise<GiftPhotoDeps> {
  const client = await createRequestSupabase();
  return { admin: createAdminSupabase(), client, viewer: await readViewer(client) };
}

function failed(e: unknown): Response {
  console.error("gift-photo: 처리 중 예외", e instanceof Error ? e.name : typeof e);
  return Response.json({ message: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." }, { status: 500, headers: NO_STORE });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { orderNo } = await params;
  try {
    const r = await signGiftPhoto(await depsOf(), orderNo);
    if (!r.ok) return new Response(null, { status: r.status, headers: NO_STORE });
    return new Response(null, { status: 302, headers: { ...NO_STORE, Location: r.url } });
  } catch (e) {
    return failed(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  const { orderNo } = await params;
  try {
    const deps = await depsOf();
    const denied = giftPhotoGate(deps.viewer);
    if (denied) return reply(denied);
    const declared = req.headers.get("content-length");
    if (declared === null || !/^\d+$/.test(declared)) {
      return Response.json({ message: "사진 크기를 알 수 없는 요청이에요. 다시 올려 주세요." }, { status: 411, headers: NO_STORE });
    }
    if (Number(declared) > PHOTO_BODY_LIMIT) return Response.json({ message: "사진은 10MB 까지 올릴 수 있어요." }, { status: 413, headers: NO_STORE });
    let file: Blob | null = null;
    try {
      const value = (await req.formData()).get("photo");
      file = value instanceof Blob ? value : null;
    } catch {
      file = null;
    }
    return reply(await saveGiftPhoto(deps, orderNo, file));
  } catch (e) {
    return failed(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!isSameOrigin(req.headers)) return Response.json({ message: "잘못된 요청이에요." }, { status: 403, headers: NO_STORE });
  const { orderNo } = await params;
  try {
    return reply(await removeGiftPhoto(await depsOf(), orderNo));
  } catch (e) {
    return failed(e);
  }
}
