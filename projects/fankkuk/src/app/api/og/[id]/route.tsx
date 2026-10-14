import { ImageResponse } from "next/og";
import { readCreatorLinkExtras } from "@/entities/creator/api/creator-link-reads";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { isCurrentPreviewVersion, previewImageInput, previewImagePath, previewImageVersion } from "@/entities/creator/model/link-images";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { readImageFont, readLogoDataUrl, readPhotoDataUrl } from "@/widgets/link-images/api/image-assets";
import { PreviewImageCard } from "@/widgets/link-images/ui/link-image-cards";

// 링크 미리보기 이미지(creator-link INV-E9·E10, 추가분 F-2). 로그인과 상관없는 공개 이미지 — 공개 읽기(creator_by_id · creator_link_extras)만 부르고,
// 그 결과를 previewImageInput 에 넘겨 돌아온 이름·고른 사진(프로필 사진 또는 팬덤 심볼)만 그린다. 본인 확인 전·없는 크리에이터는 404.
// 주소의 v(고른 사진의 판)가 지금 판과 다르거나 없으면 지금 판 주소로 넘긴다(307, 넘기기 자체는 캐시하지 않는다 — 판은 바뀐다).
// 맞으면 그 주소는 늘 같은 사진이라 공유 캐시가 오래 들고 있게 한다. 공개 이름을 바꾸면 이 기간 동안 옛 이름이 남을 수 있다 —
// SNS 도 미리보기를 따로 오래 들고 있어 사진 판처럼 주소를 바꾸지 않는 한 어차피 새로 읽지 않는다.

const PREVIEW_CACHE = "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const client = createPublicReadSupabase();
  const [creator] = await readCreatorCards(client, { signedIn: false, onlyId: id });
  if (!creator) return new Response("없는 크리에이터예요.", { status: 404 });
  const { look } = await readCreatorLinkExtras(client, creator.id);
  const url = new URL(req.url);
  if (!isCurrentPreviewVersion(url.searchParams.get("v"), previewImageVersion(creator, look))) {
    return new Response(null, { status: 307, headers: { Location: new URL(previewImagePath(creator, look), url).toString(), "Cache-Control": "no-store" } });
  }
  const input = previewImageInput(creator, look, readPublicStorageBase());
  const [font, logo, image] = await Promise.all([readImageFont(), readLogoDataUrl(), readPhotoDataUrl(input.imageUrl)]);
  return new ImageResponse(<PreviewImageCard name={input.name} image={image} pick={input.pick} logo={logo} />, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Pretendard", data: font, weight: 800, style: "normal" }],
    headers: { "Cache-Control": PREVIEW_CACHE },
  });
}
