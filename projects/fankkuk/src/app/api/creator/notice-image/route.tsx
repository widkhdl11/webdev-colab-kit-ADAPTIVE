import { ImageResponse } from "next/og";
import { readCreatorCards, readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { noticeImageInput } from "@/entities/creator/model/link-images";
import { readViewer } from "@/entities/session/model/viewer";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { readImageFont, readPhotoDataUrl } from "@/widgets/link-images/api/image-assets";
import { NoticeImageCard } from "@/widgets/link-images/ui/link-image-cards";

// 공지 이미지 내려받기(creator-link INV-E10, 추가분 F-8) — 로그인한 크리에이터 본인 것만.
// 그리는 값은 본인의 공개 줄(creator_by_id — 본인 확인된 크리에이터만)을 noticeImageInput 에 넘겨 돌아온 사진·링크 주소(사진이 없으면 이름 첫 글자)뿐이다.
// 링크용 아이디가 없거나 본인 확인 전이면 만들지 않는다(링크가 열리지 않는다). 응답은 캐시하지 않는다.

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const supabase = await createRequestSupabase();
  const viewer = await readViewer(supabase);
  if (!viewer) return Response.json({ message: "로그인이 필요해요." }, { status: 401, headers: NO_STORE });
  if (viewer.role !== "creator") return Response.json({ message: "크리에이터 계정만 내려받을 수 있어요." }, { status: 403, headers: NO_STORE });
  const ownId = await readOwnCreatorId(supabase);
  const [creator] = ownId ? await readCreatorCards(supabase, { signedIn: true, onlyId: ownId }) : [];
  const input = creator ? noticeImageInput(creator, readPublicStorageBase()) : null;
  if (!input) return Response.json({ message: "본인 확인을 마치고 링크 주소를 정하면 내려받을 수 있어요." }, { status: 404, headers: NO_STORE });
  const [font, photo] = await Promise.all([readImageFont(), readPhotoDataUrl(input.photoUrl)]);
  return new ImageResponse(<NoticeImageCard photo={photo} initial={input.initial} linkText={input.linkText} />, {
    width: 1080,
    height: 1080,
    fonts: [{ name: "Pretendard", data: font, weight: 800, style: "normal" }],
    headers: { ...NO_STORE, "Content-Disposition": 'attachment; filename="fankkuk-notice.png"' },
  });
}
