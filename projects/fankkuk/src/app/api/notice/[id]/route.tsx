import { ImageResponse } from "next/og";
import { readCreatorLinkExtras } from "@/entities/creator/api/creator-link-reads";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { NOTICE_SIZES, noticeImageInput, noticeImagePath, parseNoticeSize } from "@/entities/creator/model/link-images";
import { createPublicReadSupabase, readPublicStorageBase } from "@/shared/api/supabase/detached";
import { BACKGROUND_MAX_PIXELS, readImageFonts, readPhotoDataUrl, readPhotoDataUrlCached } from "@/widgets/link-images/api/image-assets";
import { NOTICE_FONT_WEIGHTS, NoticeImageCard } from "@/widgets/link-images/ui/link-image-cards";

// 공지 이미지(홍보 카드) — 정사각·스토리 세로·가로 (creator-link INV-E7·E10, 디자인 기준 10절, 「내 팬꾹 꾸미기」의 「공지 이미지 받기」).
// 스펙의 「공개 화면」이라 로그인과 상관없이 열린다 — 크리에이터가 링크를 복사해 붙일 수 있게. 공개 읽기(creator_by_id · creator_link_extras)만 부르고,
// 그 결과를 noticeImageInput 에 넘겨 돌아온 배경사진·프로필 사진·공개 이름·한 줄 소개·링크 주소만 그린다.
// 거르는 순서: 크리에이터 ID 꼴(404) → 크기 세 값(400) → 쿼리가 정해진 꼴이 아니면 정해진 주소로 넘김(307, 넘기기는 캐시하지 않는다 —
// 미리보기 라우트와 같은 방식. 쿼리를 바꿔 붙여 공유 캐시를 우회하지 못하게) → DB 읽기. 여기까지는 DB 를 부르지 않는다.
// 링크용 아이디가 없거나 본인 확인 전·없는 크리에이터면 만들지 않는다(404).
// 이름·소개는 판 번호가 없어 바뀌면 바로 반영되도록 공유 캐시는 짧게 둔다. ?download=1 이면 파일로 내려받고 캐시하지 않는다 —
// 이름·사진을 바꾼 직후 받아도 새 그림이 나오게.
// 프로필 사진·배경사진 바이트는 경로(판 번호가 들어 있다)별로 이 프로세스 안에 들고 있는다(readPhotoDataUrlCached).

const NOTICE_CACHE = "public, max-age=300";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const readBackground = (url: string | null) => readPhotoDataUrl(url, BACKGROUND_MAX_PIXELS);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return new Response("없는 크리에이터예요.", { status: 404 });
  const url = new URL(req.url);
  const size = parseNoticeSize(url.searchParams.get("size"));
  if (!size) return new Response("크기는 square·story·wide 가운데 하나예요.", { status: 400 });
  const download = url.searchParams.get("download") === "1";
  const canonical = noticeImagePath(id, size, { download });
  if (url.pathname + url.search !== canonical) {
    return new Response(null, { status: 307, headers: { Location: new URL(canonical, url).toString(), "Cache-Control": "no-store" } });
  }

  const client = createPublicReadSupabase();
  const [creator] = await readCreatorCards(client, { signedIn: false, onlyId: id });
  if (!creator) return new Response("없는 크리에이터예요.", { status: 404 });
  const { look } = await readCreatorLinkExtras(client, creator.id);
  const input = noticeImageInput(creator, look, readPublicStorageBase());
  if (!input) return new Response("링크 주소를 정하면 만들 수 있어요.", { status: 404 });
  const [fonts, photo, background] = await Promise.all([
    readImageFonts(NOTICE_FONT_WEIGHTS),
    readPhotoDataUrlCached(input.photoUrl),
    readPhotoDataUrlCached(input.backgroundUrl, readBackground),
  ]);
  const headers: Record<string, string> = download
    ? { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="fankkuk-notice-${size}.png"` }
    : { "Cache-Control": NOTICE_CACHE };
  return new ImageResponse(<NoticeImageCard size={size} input={input} photo={photo} background={background} />, {
    ...NOTICE_SIZES[size],
    fonts,
    headers,
  });
}
