import { z } from "zod";
import { PASTEL_TONES, type PastelTone } from "@/shared/config/pastel-tones";
import { bannerLinkKind } from "./banner-rules";

export { BANNER_DESCRIPTION_MAX, BANNER_TITLE_MAX, bannerLinkKind, bannerTextOk, type BannerLinkKind } from "./banner-rules";

// 광고 배너 (docs/specs/banners.md). 공개 읽기(list_banners)·운영자 목록(admin_banners)의 줄을 경계에서 검사해 화면 값으로 바꾼다.
// 줄 하나라도 꼴이 다르면(규칙 밖 링크·서버가 정하지 않은 그림 경로 포함) 목록 전체를 null 로 본다 — 부르는 쪽이 칸을 그리지 않는다.

/** 배너 그림 공개 저장소(INV-Y4·Y5) */
export const BANNER_BUCKET = "banner-images";

/** 서버가 정한 그림 이름 — b- + 짐작할 수 없는 32자 + .webp (DB banner_image_path_ok 와 같은 꼴) */
export const BANNER_IMAGE_PATH = /^b-[0-9a-f]{32}\.webp$/;

/** INV-Y2: 상태는 DB 가 계산해 준다(저장하지 않는다). live 보이는 중 · scheduled 예정 · ended 끝남 */
export type BannerState = "live" | "scheduled" | "ended";

export const BANNER_STATE_LABEL: Record<BannerState, string> = { live: "보이는 중", scheduled: "예정", ended: "끝남" };

export type PublicBanner = { id: string; title: string; description: string; link: string; isAd: boolean; imagePath: string };

export type AdminBanner = PublicBanner & { sortOrder: number; startsOn: string; endsOn: string | null; state: BannerState };

/** 화면이 그리는 배너 한 장 — 그림은 공개 저장소 주소(미리보기에서는 고른 파일 주소, 없으면 null) */
export type BannerView = { id: string; title: string; description: string; link: string; isAd: boolean; imageUrl: string | null };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const publicRow = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    link: z.string().refine((l) => bannerLinkKind(l) !== null),
    is_ad: z.boolean(),
    image_path: z.string().regex(BANNER_IMAGE_PATH),
  })
  .transform((r): PublicBanner => ({ id: r.id, title: r.title, description: r.description, link: r.link, isAd: r.is_ad, imagePath: r.image_path }));

const adminRow = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    description: z.string(),
    link: z.string(),
    is_ad: z.boolean(),
    image_path: z.string().regex(BANNER_IMAGE_PATH),
    sort_order: z.number().int(),
    starts_on: z.string().regex(DATE),
    ends_on: z.string().regex(DATE).nullable(),
    state: z.enum(["live", "scheduled", "ended"]),
  })
  .transform(
    (r): AdminBanner => ({
      id: r.id,
      title: r.title,
      description: r.description,
      link: r.link,
      isAd: r.is_ad,
      imagePath: r.image_path,
      sortOrder: r.sort_order,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      state: r.state,
    }),
  );

/** INV-Y8: 공개 읽기 줄 — DB 가 정한 순서 그대로. 꼴이 다르면 null. */
export function parsePublicBanners(rows: unknown): PublicBanner[] | null {
  const r = z.array(publicRow).safeParse(rows);
  return r.success ? r.data : null;
}

export function parseAdminBanners(rows: unknown): AdminBanner[] | null {
  const r = z.array(adminRow).safeParse(rows);
  return r.success ? r.data : null;
}

/** 공개 저장소의 그림 주소 */
export function bannerImageUrl(storageBase: string, path: string): string {
  return `${storageBase}/storage/v1/object/public/${BANNER_BUCKET}/${path}`;
}

export function toBannerViews(banners: readonly PublicBanner[], storageBase: string): BannerView[] {
  return banners.map(({ imagePath, ...b }) => ({ ...b, imageUrl: bannerImageUrl(storageBase, imagePath) }));
}

/** 장 바탕 — 파스텔 8색을 보이는 순서대로 돌려 쓴다(design-rules 16절 ②, 운영자 입력 칸 없음) */
export function bannerTone(index: number): PastelTone {
  return PASTEL_TONES[((index % PASTEL_TONES.length) + PASTEL_TONES.length) % PASTEL_TONES.length]!;
}
