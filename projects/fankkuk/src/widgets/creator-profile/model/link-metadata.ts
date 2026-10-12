import type { Metadata } from "next";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { previewImagePath, type PublicCreatorLink } from "@/entities/creator/model/link-images";
import { PROMISE } from "@/shared/config/site-copy";

// 선물 링크 페이지의 미리보기 정보(creator-link INV-E9·E10, 추가분 F-2). X·카카오톡이 링크를 붙일 때 읽는다.
// 미리보기 이미지 주소에는 사진 판(v)이 붙어 사진을 바꾸면 새 주소가 된다. 설명 문구는 정해진 문구뿐이다.

export function creatorLinkMetadata(c: PublicCreatorLink, origin: string): Metadata {
  const title = `${c.name}님에게 선물 보내기 · 팬꾹`;
  const description = `${PROMISE.approval} ${PROMISE.inspection} ${PROMISE.address}`;
  const image = { url: previewImagePath(c), width: 1200, height: 630, alt: `${c.name}님의 미리보기 이미지` };
  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: { canonical: creatorPagePath(c) },
    openGraph: { type: "profile", title, description, url: creatorPagePath(c), siteName: "팬꾹", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** 요청이 들어온 주소(Host)로 사이트 주소를 만든다. 전달된 이름(x-forwarded-host)은 보내는 쪽이 마음대로 넣을 수 있어 쓰지 않는다. */
export function requestOrigin(headers: Pick<Headers, "get">): string {
  const host = headers.get("host") ?? "localhost";
  const proto = headers.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
