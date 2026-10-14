import { ImageResponse } from "next/og";
import { readCreatorLinkExtras } from "@/entities/creator/api/creator-link-reads";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { NOTICE_SIZES, noticeImageInput, parseNoticeSize } from "@/entities/creator/model/link-images";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { BACKGROUND_MAX_PIXELS, readImageFont, readPhotoDataUrl } from "@/widgets/link-images/api/image-assets";
import { NoticeImageCard } from "@/widgets/link-images/ui/link-image-cards";

// 공지 이미지(홍보 카드) — 정사각·스토리 세로·가로 (creator-link INV-E7·E10, 디자인 기준 10절, 「내 팬꾹 꾸미기」의 「공지 이미지 받기」).
// 스펙의 「공개 화면」이라 로그인과 상관없이 열린다 — 크리에이터가 링크를 복사해 붙일 수 있게. 공개 읽기(creator_by_id · creator_link_extras)만 부르고,
// 그 결과를 noticeImageInput 에 넘겨 돌아온 배경사진·프로필 사진·공개 이름·한 줄 소개·링크 주소만 그린다.
// 링크용 아이디가 없거나 본인 확인 전·없는 크리에이터면 만들지 않는다(404). 크기는 세 값만(400).
// 이름·소개는 판 번호가 없어 바뀌면 바로 반영되도록 공유 캐시는 짧게 둔다. ?download=1 이면 파일로 내려받는다.

const NOTICE_CACHE = "public, max-age=300";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return new Response("없는 크리에이터예요.", { status: 404 });
  const url = new URL(req.url);
  const client = createPublicReadSupabase();
  const [creator] = await readCreatorCards(client, { signedIn: false, onlyId: id });
  if (!creator) return new Response("없는 크리에이터예요.", { status: 404 });
  const { look } = await readCreatorLinkExtras(client, creator.id);
  const input = noticeImageInput(creator, look, readPublicStorageBase());
  if (!input) return new Response("링크 주소를 정하면 만들 수 있어요.", { status: 404 });
  const size = parseNoticeSize(url.searchParams.get("size"));
  if (!size) return new Response("크기는 square·story·wide 가운데 하나예요.", { status: 400 });
  const [font, photo, background] = await Promise.all([readImageFont(), readPhotoDataUrl(input.photoUrl), readPhotoDataUrl(input.backgroundUrl, BACKGROUND_MAX_PIXELS)]);
  const headers: Record<string, string> = { "Cache-Control": NOTICE_CACHE };
  if (url.searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="fankkuk-notice-${size}.png"`;
  return new ImageResponse(<NoticeImageCard size={size} input={input} photo={photo} background={background} />, {
    ...NOTICE_SIZES[size],
    fonts: [{ name: "Pretendard", data: font, weight: 800, style: "normal" }],
    headers,
  });
}
