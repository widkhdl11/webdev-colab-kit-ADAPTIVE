import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

// 공개 화면 이미지(미리보기·공지)에 쓰는 재료 — 글꼴·로고·프로필 사진 바이트 (creator-link INV-E10).
// 이미지 그리기(next/og)는 CSS 변수를 읽지 못하고 웹 글꼴도 받지 않아, 글꼴 파일을 직접 읽어 넘긴다.
// 글꼴: Pretendard ExtraBold 부분 글꼴(한글 완성형 2,350자 + 영문·숫자, OFL — assets/fonts/OFL.txt). 공개 이름에 이 범위 밖 글자가 있으면 그 글자는 빠진다.

let fontCache: Promise<ArrayBuffer> | null = null;
let logoCache: Promise<string> | null = null;

export function readImageFont(): Promise<ArrayBuffer> {
  fontCache ??= readFile(join(process.cwd(), "assets", "fonts", "Pretendard-ExtraBold.subset.woff")).then((b) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  );
  return fontCache;
}

/** 팬꾹 로고(src/app/icon.svg)를 이미지 안에 넣을 data 주소로. */
export function readLogoDataUrl(): Promise<string> {
  logoCache ??= readFile(join(process.cwd(), "src", "app", "icon.svg")).then((b) => `data:image/svg+xml;base64,${b.toString("base64")}`);
  return logoCache;
}

/**
 * 공개 저장소의 프로필 사진을 data 주소로 읽는다. 못 읽으면 null(기본 이미지로 그린다).
 * 주소는 서버가 정한 공개 저장소 주소만 온다(creatorPhotoUrl — 경로 꼴 검사를 거친 값).
 */
export async function readPhotoDataUrl(photoUrl: string | null): Promise<string | null> {
  if (!photoUrl) return null;
  try {
    const res = await fetch(photoUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok || res.headers.get("content-type") !== "image/webp") return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength > 1024 * 1024) return null;
    // 이미지 그리기(next/og)는 webp 를 읽지 못해 응답이 중간에 끊긴다(2026-10-11 화면 확인) — PNG 로 바꿔 넣는다
    const png = await sharp(bytes, { limitInputPixels: 1024 * 1024 }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** 사진 캐시에 들고 있는 최대 장수 — 넘치면 가장 먼저 넣은 것부터 버린다. */
const PHOTO_CACHE_MAX = 256;
const photoCache = new Map<string, string>();

/**
 * readPhotoDataUrl 을 사진 주소(= 저장소 경로)별로 이 프로세스 안에 들고 있는다 — 공유 카드처럼 같은 사진을 자주 다시 그리는 라우트용.
 * 사진 경로에는 사진 판 번호가 들어 있어(새로 올리면 경로가 바뀐다) 옛 사진이 남지 않는다. 못 읽은 경우(null)는 들고 있지 않는다.
 * 응답 캐시와는 따로다 — 응답(답장 내용)은 캐시하지 않고, 사진 바이트만 다시 받지 않는다.
 */
export async function readPhotoDataUrlCached(photoUrl: string | null, read: (url: string | null) => Promise<string | null> = readPhotoDataUrl): Promise<string | null> {
  if (!photoUrl) return null;
  const hit = photoCache.get(photoUrl);
  if (hit !== undefined) return hit;
  const data = await read(photoUrl);
  if (data === null) return null;
  if (photoCache.size >= PHOTO_CACHE_MAX) {
    const oldest = photoCache.keys().next().value;
    if (oldest !== undefined) photoCache.delete(oldest);
  }
  photoCache.set(photoUrl, data);
  return data;
}

/** 시험용 — 사진 캐시를 비운다. */
export function clearPhotoCache(): void {
  photoCache.clear();
}
