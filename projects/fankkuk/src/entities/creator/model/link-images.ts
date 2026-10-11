import { nameInitial } from "@/shared/lib/format/name-initial";
import { linkText } from "./creator-handle";

// 공개 화면 이미지(미리보기·공지)와 프로필 사진 주소 (creator-link INV-E7·E9·E10).
// 이미지 라우트는 공개 읽기 결과를 이 함수에 넘기고, 돌아온 값만 그린다 — 다른 칸은 그리는 쪽에 닿지 않는다.

/** 공개 화면이 아는 크리에이터 — 공개 이름·링크용 아이디·사진 경로만. */
export type PublicCreatorLink = { id: string; name: string; handle: string | null; photoPath: string | null };

export const PHOTO_BUCKET = "creator-photos";

/** 저장소 경로 꼴 — {크리에이터 ID}/{판 번호}.webp (서버 저장 경로 하나가 만든다, INV-E9). */
const PHOTO_PATH = /^([0-9a-f-]{1,36})\/([1-9][0-9]{0,8})\.webp$/;

/** 공개 저장소의 사진 주소. 경로 꼴이 아니면 null. */
export function creatorPhotoUrl(storageBase: string, photoPath: string | null): string | null {
  if (!photoPath || !PHOTO_PATH.test(photoPath)) return null;
  return `${storageBase}/storage/v1/object/public/${PHOTO_BUCKET}/${photoPath}`;
}

/** 사진 판 번호 — 파일 이름의 번호. 사진이 없으면 0. */
export function photoVersionOf(photoPath: string | null): number {
  const m = photoPath ? PHOTO_PATH.exec(photoPath) : null;
  return m ? Number(m[2]) : 0;
}

/** 미리보기 이미지 주소 — 사진 판이 바뀌면 v 가 바뀌어 SNS 가 새로 읽는다(INV-E9). */
export function previewImagePath(c: Pick<PublicCreatorLink, "id" | "photoPath">): string {
  return `/api/og/${c.id}?v=${photoVersionOf(c.photoPath)}`;
}

/**
 * 미리보기 이미지 주소로 들어온 v 가 지금 사진 판과 같은가. 다르거나 없으면 라우트가 지금 판 주소로 넘긴다 —
 * 같은 v 주소는 늘 같은 사진을 가리키게 되어 공유 캐시에 오래 둘 수 있다(INV-E9).
 */
export function isCurrentPreviewVersion(requested: string | null, photoPath: string | null): boolean {
  return requested !== null && /^(0|[1-9][0-9]{0,8})$/.test(requested) && Number(requested) === photoVersionOf(photoPath);
}

export { nameInitial };

/** 미리보기 이미지에 넘기는 값 — 공개 이름과 사진 주소뿐(INV-E10). 고정 문구·로고는 그리는 쪽에 있다. */
export function previewImageInput(c: PublicCreatorLink, storageBase: string): { name: string; photoUrl: string | null } {
  return { name: c.name, photoUrl: creatorPhotoUrl(storageBase, c.photoPath) };
}

/**
 * 공지 이미지에 넘기는 값 — 사진 주소·링크 주소, 그리고 사진이 없을 때 기본 이미지에 넣을 이름 첫 글자(공개 이름 전체는 넘기지 않는다).
 * 링크용 아이디가 없으면 null(내려받기 없음, INV-E10).
 */
export function noticeImageInput(c: PublicCreatorLink, storageBase: string): { photoUrl: string | null; linkText: string; initial: string } | null {
  if (!c.handle) return null;
  return { photoUrl: creatorPhotoUrl(storageBase, c.photoPath), linkText: linkText(c.handle), initial: nameInitial(c.name) };
}
