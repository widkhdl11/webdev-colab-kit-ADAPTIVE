import { PHOTO_PROBLEM_MESSAGE } from "@/shared/lib/image/photo-problem";
import { reencodePhoto } from "@/shared/lib/image/reencode-photo";

// 프로필 사진 처리 (creator-link INV-E9). 서버의 사진 저장 경로 하나만 부른다.
// 받은 바이트를 실제로 열어 보고(그림 크기 상한), 방향을 바로잡은 뒤 가운데 정사각으로 잘라 512×512 webp 로 다시 만든다(reencodePhoto).
// 사진 정보(EXIF·GPS·ICC·XMP)는 결과에 남지 않는다. 원본 바이트는 이 함수 밖으로 나가지 않는다(저장하지 않는다).

/** 저장하는 정사각 한 변. */
export const PHOTO_SIDE = 512;

export type ProcessedPhoto = { ok: true; webp: Buffer } | { ok: false; message: string };

export async function processProfilePhoto(bytes: Uint8Array): Promise<ProcessedPhoto> {
  const r = await reencodePhoto(bytes, { kind: "square", side: PHOTO_SIDE });
  return r.ok ? r : { ok: false, message: PHOTO_PROBLEM_MESSAGE[r.problem] };
}
