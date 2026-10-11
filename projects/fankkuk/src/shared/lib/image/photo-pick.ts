import { PHOTO_MAX_BYTES } from "./photo-limits";
import { PHOTO_PROBLEM_MESSAGE } from "./photo-problem";

// 파일 칸에서 고른 사진을 보내기 전에 미리 보는 검사 — 안내일 뿐이다. 서버가 내용을 열어 보고 다시 판단한다.

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** 보낼 수 없는 파일이면 그 안내 문구, 괜찮으면 null. */
export function photoPickProblem(file: { size: number; type: string }): string | null {
  if (file.size === 0) return PHOTO_PROBLEM_MESSAGE.empty;
  if (!TYPES.has(file.type)) return PHOTO_PROBLEM_MESSAGE.not_supported;
  if (file.size > PHOTO_MAX_BYTES) return PHOTO_PROBLEM_MESSAGE.too_large_file;
  return null;
}
