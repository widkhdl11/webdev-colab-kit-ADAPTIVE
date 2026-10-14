import { nameInitial } from "@/shared/lib/format/name-initial";
import { linkText } from "./creator-handle";

// 공개 화면 이미지(미리보기·공지)와 프로필 사진·배경사진·팬덤 심볼 주소 (creator-link INV-E7·E9·E10).
// 이미지 라우트는 공개 읽기 결과를 이 함수에 넘기고, 돌아온 값만 그린다 — 다른 칸은 그리는 쪽에 닿지 않는다.

/** 공개 화면이 아는 크리에이터 — 공개 이름·링크용 아이디·사진 경로·한 줄 소개만. */
export type PublicCreatorLink = { id: string; name: string; handle: string | null; photoPath: string | null; intro: string };

/** 링크 미리보기 이미지에 쓸 사진 — 프로필 사진 또는 팬덤 심볼(INV-E10). */
export type PreviewPick = "photo" | "symbol";

/** 「내 팬꾹 꾸미기」에서 정한 공개 칸 — 배경사진·심볼 경로와 미리보기 고르기(INV-E7). */
export type PublicCreatorLook = { bgPath: string | null; symbolPath: string | null; previewPick: PreviewPick };

export const NO_LOOK: PublicCreatorLook = { bgPath: null, symbolPath: null, previewPick: "photo" };

export const PHOTO_BUCKET = "creator-photos";

// 저장소 경로 꼴 — 서버 저장 경로 하나가 만든다(INV-E9). 세 칸은 서로의 꼴을 받지 않는다.
/** 프로필 사진 {크리에이터 ID}/{판}.webp */
const PHOTO_PATH = /^([0-9a-f-]{1,36})\/([1-9][0-9]{0,8})\.webp$/;
/** 배경사진 {크리에이터 ID}/bg-{판}.webp */
const BG_PATH = /^([0-9a-f-]{1,36})\/bg-([1-9][0-9]{0,8})\.webp$/;
/** 팬덤 심볼 {크리에이터 ID}/sym-{판}.webp */
const SYMBOL_PATH = /^([0-9a-f-]{1,36})\/sym-([1-9][0-9]{0,8})\.webp$/;

function storageUrl(storageBase: string, path: string | null, shape: RegExp): string | null {
  if (!path || !shape.test(path)) return null;
  return `${storageBase}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

/** 공개 저장소의 프로필 사진 주소. 경로 꼴이 아니면 null. */
export function creatorPhotoUrl(storageBase: string, photoPath: string | null): string | null {
  return storageUrl(storageBase, photoPath, PHOTO_PATH);
}

/** 공개 저장소의 배경사진 주소. 경로 꼴이 아니면 null. */
export function creatorBackgroundUrl(storageBase: string, bgPath: string | null): string | null {
  return storageUrl(storageBase, bgPath, BG_PATH);
}

/** 공개 저장소의 팬덤 심볼 주소. 경로 꼴이 아니면 null. */
export function creatorSymbolUrl(storageBase: string, symbolPath: string | null): string | null {
  return storageUrl(storageBase, symbolPath, SYMBOL_PATH);
}

/** 경로 꼴이 맞는 배경사진 경로(아니면 null) — DB 응답을 거르는 쪽이 쓴다. */
export function backgroundPathOrNull(path: string | null): string | null {
  return path && BG_PATH.test(path) ? path : null;
}

/** 경로 꼴이 맞는 심볼 경로(아니면 null). */
export function symbolPathOrNull(path: string | null): string | null {
  return path && SYMBOL_PATH.test(path) ? path : null;
}

function versionOf(path: string | null, shape: RegExp): number {
  const m = path ? shape.exec(path) : null;
  return m ? Number(m[2]) : 0;
}

/** 사진 판 번호 — 파일 이름의 번호. 사진이 없으면 0. */
export function photoVersionOf(photoPath: string | null): number {
  return versionOf(photoPath, PHOTO_PATH);
}

/** 실제로 그릴 사진 — 심볼을 골랐어도 꼴이 맞는 심볼이 없으면 프로필 사진(INV-E10). */
export function previewPickOf(look: PublicCreatorLook): PreviewPick {
  return look.previewPick === "symbol" && symbolPathOrNull(look.symbolPath) ? "symbol" : "photo";
}

/** 미리보기 이미지 판 값 — 프로필 사진이면 사진 판 번호, 심볼이면 s+심볼 판 번호(INV-E9). */
export function previewImageVersion(c: Pick<PublicCreatorLink, "photoPath">, look: PublicCreatorLook): string {
  return previewPickOf(look) === "symbol" ? `s${versionOf(look.symbolPath, SYMBOL_PATH)}` : String(photoVersionOf(c.photoPath));
}

/** 미리보기 이미지 주소 — 고른 사진의 판이 바뀌면 v 가 바뀌어 SNS 가 새로 읽는다(INV-E9). */
export function previewImagePath(c: Pick<PublicCreatorLink, "id" | "photoPath">, look: PublicCreatorLook = NO_LOOK): string {
  return `/api/og/${c.id}?v=${previewImageVersion(c, look)}`;
}

/**
 * 미리보기 이미지 주소로 들어온 v 가 지금 판(previewImageVersion)과 같은가. 다르거나 없으면 라우트가 지금 판 주소로 넘긴다 —
 * 같은 v 주소는 늘 같은 사진을 가리키게 되어 공유 캐시에 오래 둘 수 있다(INV-E9).
 */
export function isCurrentPreviewVersion(requested: string | null, current: string): boolean {
  return requested !== null && requested === current;
}

export { nameInitial };

/** 미리보기 이미지에 넘기는 값 — 공개 이름과 고른 사진 주소뿐(INV-E10). 고정 문구·로고는 그리는 쪽에 있다. */
export function previewImageInput(
  c: PublicCreatorLink,
  look: PublicCreatorLook,
  storageBase: string,
): { name: string; imageUrl: string | null; pick: PreviewPick } {
  const pick = previewPickOf(look);
  const imageUrl = pick === "symbol" ? creatorSymbolUrl(storageBase, look.symbolPath) : creatorPhotoUrl(storageBase, c.photoPath);
  return { name: c.name, imageUrl, pick };
}

/** 공지 이미지 세 크기(INV-E10) — 정사각·스토리 세로·가로. */
export const NOTICE_SIZES = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
  wide: { width: 1200, height: 675 },
} as const;

export type NoticeSize = keyof typeof NOTICE_SIZES;

/** 주소로 들어온 크기 값 — 세 값 밖이면 null. */
export function parseNoticeSize(raw: string | null): NoticeSize | null {
  return raw === "square" || raw === "story" || raw === "wide" ? raw : null;
}

/**
 * 공지 이미지 주소 — 로그인 없이 열리는 공개 화면이다(스펙 「공개 화면」). 쿼리는 size 와(내려받기면) download=1 둘뿐이고 순서도 이것이 정본이다 —
 * 라우트는 다른 꼴로 들어오면 이 주소로 넘긴다(쿼리를 바꿔 붙여 공유 캐시를 우회하지 못하게).
 */
export function noticeImagePath(creatorId: string, size: NoticeSize, opts: { download?: boolean } = {}): string {
  return `/api/notice/${creatorId}?size=${size}${opts.download ? "&download=1" : ""}`;
}

export type NoticeImageInput = {
  name: string;
  intro: string;
  photoUrl: string | null;
  backgroundUrl: string | null;
  linkText: string;
  /** 사진이 없을 때 기본 이미지에 넣을 이름 첫 글자 */
  initial: string;
};

/**
 * 공지 이미지에 넘기는 값 — 배경사진·프로필 사진·공개 이름·한 줄 소개·링크 주소(사진이 없으면 이름 첫 글자). 심볼은 넣지 않는다.
 * 링크용 아이디가 없으면 null(내려받기 없음, INV-E10).
 */
export function noticeImageInput(c: PublicCreatorLink, look: PublicCreatorLook, storageBase: string): NoticeImageInput | null {
  if (!c.handle) return null;
  return {
    name: c.name,
    intro: c.intro.trim(),
    photoUrl: creatorPhotoUrl(storageBase, c.photoPath),
    backgroundUrl: creatorBackgroundUrl(storageBase, look.bgPath),
    linkText: linkText(c.handle),
    initial: nameInitial(c.name),
  };
}
