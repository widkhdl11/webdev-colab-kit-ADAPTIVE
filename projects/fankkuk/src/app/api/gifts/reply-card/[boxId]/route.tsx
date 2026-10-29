import { ImageResponse } from "next/og";
import { readMyReplyCard } from "@/entities/gift-reply/api/gift-reply-reads";
import { isCardSize, CARD_SIZES } from "@/entities/gift-reply/model/reply";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { replyCardInput } from "@/entities/gift-reply/model/reply-card";
import { readViewer } from "@/entities/session/model/viewer";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { readImageFont, readLogoDataUrl, readPhotoDataUrlCached } from "@/widgets/link-images/api/image-assets";
import { ReplyShareCard } from "@/widgets/link-images/ui/reply-share-card";

// 답장 공유 카드 이미지 (gift-reply INV-G9). 그 선물을 보낸 사람 본인만 — 로그인한 사람의 세션으로 DB 읽기 함수(my_gift_reply_card)를 부르고,
// DB 가 보낸 사람인지·지우지 않은 답장인지 확인해 정해진 칸만 돌려준다. 남의 상자·답장 없음·지운 답장은 같은 404.
// 주소: /api/gifts/reply-card/{상자 ID}?size=square|wide&name=1(팬 닉네임 넣기)&download=1(내려받기).
// 응답은 캐시하지 않는다(지운 답장이 바로 사라져야 한다, INV-G4) — 크리에이터 사진 바이트만 경로별로 프로세스 안에 들고 있는다.

const NO_STORE = { "Cache-Control": "no-store" } as const;
const BOX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request, ctx: { params: Promise<{ boxId: string }> }) {
  const { boxId } = await ctx.params;
  const url = new URL(req.url);
  const sizeParam = url.searchParams.get("size") ?? "square";
  if (!BOX_ID.test(boxId) || !isCardSize(sizeParam)) return Response.json({ message: "유효하지 않은 요청입니다." }, { status: 400, headers: NO_STORE });
  const supabase = await createRequestSupabase();
  const viewer = await readViewer(supabase);
  if (!viewer) return Response.json({ message: "로그인이 필요합니다." }, { status: 401, headers: NO_STORE });
  const row = await readMyReplyCard(supabase, boxId);
  if (!row) return Response.json({ message: "답장을 요청한 항목을 찾을 수 없습니다." }, { status: 404, headers: NO_STORE });
  const card = replyCardInput(row, { withName: url.searchParams.get("name") === "1", photoUrl: creatorPhotoUrl(readPublicStorageBase(), row.creatorPhotoPath) });
  const [font, logo, photo] = await Promise.all([readImageFont(), readLogoDataUrl(), readPhotoDataUrlCached(card.photoUrl)]);
  const { width, height } = CARD_SIZES[sizeParam];
  const disposition = url.searchParams.get("download") === "1" ? `attachment; filename="fankkuk-reply-${sizeParam}.png"` : "inline";
  return new ImageResponse(<ReplyShareCard card={card} size={sizeParam} photo={photo} logo={logo} />, {
    width,
    height,
    fonts: [{ name: "Pretendard", data: font, weight: 800, style: "normal" }],
    headers: { ...NO_STORE, "Content-Disposition": disposition },
  });
}
