import { ImageResponse } from "next/og";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { previewImageInput } from "@/entities/creator/model/link-images";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { readImageFont, readLogoDataUrl, readPhotoDataUrl } from "@/widgets/link-images/api/image-assets";
import { PreviewImageCard } from "@/widgets/link-images/ui/link-image-cards";

// 링크 미리보기 이미지(creator-link INV-E10, 추가분 F-2). 로그인과 상관없는 공개 이미지 — 공개 읽기(creator_by_id)만 부르고,
// 그 결과를 previewImageInput 에 넘겨 돌아온 이름·사진만 그린다. 본인 확인 전·없는 크리에이터는 404.
// 주소의 v(사진 판)는 SNS 캐시를 새로 읽히는 용도라 여기서는 읽지 않는다 — 늘 지금 사진으로 그린다.

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [creator] = await readCreatorCards(createPublicReadSupabase(), { signedIn: false, onlyId: id });
  if (!creator) return new Response("없는 크리에이터예요.", { status: 404 });
  const input = previewImageInput(creator, readPublicStorageBase());
  const [font, logo, photo] = await Promise.all([readImageFont(), readLogoDataUrl(), readPhotoDataUrl(input.photoUrl)]);
  return new ImageResponse(<PreviewImageCard name={input.name} photo={photo} logo={logo} />, {
    width: 1200,
    height: 630,
    fonts: [{ name: "Pretendard", data: font, weight: 800, style: "normal" }],
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
