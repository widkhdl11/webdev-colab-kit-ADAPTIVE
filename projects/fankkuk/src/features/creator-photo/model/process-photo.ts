import sharp from "sharp";
import { PHOTO_MAX_BYTES } from "./photo-limits";

// 프로필 사진 처리 (creator-link INV-E9). 서버의 사진 저장 경로 하나만 부른다.
// 받은 바이트를 실제로 열어 보고(그림 크기 상한), 방향을 바로잡은 뒤 가운데 정사각으로 잘라 512×512 webp 로 다시 만든다.
// sharp 는 따로 지시하지 않으면 사진 정보(EXIF·GPS·ICC·XMP)를 결과에 옮기지 않는다 — 결과에 남는 것은 그림뿐이다.
// 원본 바이트는 이 함수 밖으로 나가지 않는다(저장하지 않는다).

/** 열어 볼 그림 크기 상한 — 4천만 화소(압축 폭탄 방어). */
export const PHOTO_MAX_PIXELS = 40_000_000;
/** 저장하는 정사각 한 변. */
export const PHOTO_SIDE = 512;

const ACCEPTED = new Set(["jpeg", "png", "webp"]);

export type ProcessedPhoto = { ok: true; webp: Buffer } | { ok: false; message: string };

export async function processProfilePhoto(bytes: Uint8Array): Promise<ProcessedPhoto> {
  if (bytes.byteLength === 0) return { ok: false, message: "사진 파일을 골라 주세요." };
  if (bytes.byteLength > PHOTO_MAX_BYTES) return { ok: false, message: "사진은 10MB 까지 올릴 수 있어요." };
  try {
    const opts = { limitInputPixels: PHOTO_MAX_PIXELS, failOn: "error" as const };
    // 확장자·브라우저가 붙인 종류는 믿지 않는다 — 내용을 열어 본 형식으로만 판단한다
    const meta = await sharp(bytes, opts).metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) return { ok: false, message: "jpg·png·webp 사진만 올릴 수 있어요." };
    if (!meta.width || !meta.height || meta.width * meta.height > PHOTO_MAX_PIXELS) {
      return { ok: false, message: "사진이 너무 커요. 더 작은 사진으로 올려 주세요." };
    }
    const webp = await sharp(bytes, opts)
      .rotate() // 사진 정보의 방향 값대로 돌린 뒤(그 값은 결과에 남지 않는다)
      .resize(PHOTO_SIDE, PHOTO_SIDE, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    return { ok: false, message: "사진을 열 수 없어요. 다른 사진으로 올려 주세요." };
  }
}
