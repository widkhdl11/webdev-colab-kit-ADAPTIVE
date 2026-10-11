import sharp from "sharp";
import { PHOTO_MAX_BYTES, PHOTO_MAX_PIXELS } from "./photo-limits";

// 올린 사진을 서버에서 다시 만든다 — 받은 바이트를 실제로 열어 보고(그림 크기 상한), 방향을 바로잡은 뒤 크기를 맞춰 webp 로 새로 쓴다.
// sharp 는 따로 지시하지 않으면 사진 정보(EXIF·GPS·ICC·XMP)를 결과에 옮기지 않는다 — 결과에 남는 것은 그림뿐이다.
// 원본 바이트는 이 함수 밖으로 나가지 않는다(부르는 쪽이 저장하지 않는다).
// 크기 맞추기: square = 가운데 정사각으로 잘라 한 변 side / fit = 긴 변이 longSide 를 넘으면 줄인다(작은 사진은 키우지 않는다).

export type Reencode = { kind: "square"; side: number } | { kind: "fit"; longSide: number };

export type ReencodeProblem = "empty" | "too_large_file" | "not_supported" | "too_many_pixels" | "unreadable";
export type ReencodeResult = { ok: true; webp: Buffer } | { ok: false; problem: ReencodeProblem };

const ACCEPTED = new Set(["jpeg", "png", "webp"]);

export async function reencodePhoto(bytes: Uint8Array, size: Reencode): Promise<ReencodeResult> {
  if (bytes.byteLength === 0) return { ok: false, problem: "empty" };
  if (bytes.byteLength > PHOTO_MAX_BYTES) return { ok: false, problem: "too_large_file" };
  try {
    const opts = { limitInputPixels: PHOTO_MAX_PIXELS, failOn: "error" as const };
    // 확장자·브라우저가 붙인 종류는 믿지 않는다 — 내용을 열어 본 형식으로만 판단한다
    const meta = await sharp(bytes, opts).metadata();
    if (!meta.format || !ACCEPTED.has(meta.format)) return { ok: false, problem: "not_supported" };
    if (!meta.width || !meta.height || meta.width * meta.height > PHOTO_MAX_PIXELS) return { ok: false, problem: "too_many_pixels" };
    const turned = sharp(bytes, opts).rotate(); // 사진 정보의 방향 값대로 돌린 뒤(그 값은 결과에 남지 않는다)
    const sized =
      size.kind === "square"
        ? turned.resize(size.side, size.side, { fit: "cover", position: "centre" })
        : turned.resize(size.longSide, size.longSide, { fit: "inside", withoutEnlargement: true });
    return { ok: true, webp: await sized.webp({ quality: 82 }).toBuffer() };
  } catch {
    return { ok: false, problem: "unreadable" };
  }
}
