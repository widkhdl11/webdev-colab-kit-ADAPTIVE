import type { PhotoProblem } from "@/shared/lib/image/photo-problem";

// 배너 그림 올리기 상한과 안내 문구 (docs/specs/banners.md INV-Y4, 시안 admin-banners-pc 「PNG·JPG, 5MB 이하」).
// 서버의 그림 처리와 화면 양식의 미리 검사가 같은 값·문구를 쓴다. 이 파일은 다른 모듈을 끌고 오지 않는다(브라우저 번들에도 들어간다).

/** 올릴 수 있는 그림 크기 — 5MB */
export const BANNER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 라우트가 받는 본문 상한 — 그림에 양식 경계·글 칸 몫(64KB)을 더한 값 */
export const BANNER_BODY_LIMIT = BANNER_IMAGE_MAX_BYTES + 64 * 1024;

/** 파일 칸 accept — 실제 형식은 서버가 내용을 열어 보고 다시 판단한다 */
export const BANNER_IMAGE_ACCEPT = "image/png,image/jpeg";

export const BANNER_IMAGE_MESSAGE: Record<PhotoProblem, string> = {
  empty: "그림을 골라 주세요.",
  too_large_file: "그림은 5MB 까지 올릴 수 있어요.",
  not_supported: "PNG·JPG 그림만 올릴 수 있어요.",
  too_many_pixels: "그림이 너무 커요. 더 작은 그림으로 올려 주세요.",
  unreadable: "그림을 열 수 없어요. 다른 그림으로 올려 주세요.",
};

const TYPES = new Set(["image/png", "image/jpeg"]);

/** 파일 칸에서 고른 그림을 보내기 전에 미리 보는 검사 — 안내일 뿐이다. 보낼 수 없으면 그 문구, 괜찮으면 null */
export function bannerImagePickProblem(file: { size: number; type: string }): string | null {
  if (file.size === 0) return BANNER_IMAGE_MESSAGE.empty;
  if (!TYPES.has(file.type)) return BANNER_IMAGE_MESSAGE.not_supported;
  if (file.size > BANNER_IMAGE_MAX_BYTES) return BANNER_IMAGE_MESSAGE.too_large_file;
  return null;
}
